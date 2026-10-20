from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import psycopg
from fastapi.testclient import TestClient
from slotiva.db import connect, migrate
from slotiva.main import app
from slotiva.services import today

ORIGIN = {"origin": "http://localhost:5173"}


def day():
    value = today() + timedelta(days=1)
    while value.weekday() > 4:
        value += timedelta(days=1)
    return value.isoformat()


def payload(at="09:00", service="consulting"):
    return dict(serviceId=service, date=day(), time=at, name="Demo", email="demo@example.com")


def test_concurrent_requests_have_one_winner(db):
    barrier = Barrier(2)

    def book(_):
        with TestClient(app) as client:
            barrier.wait(timeout=10)
            return client.post("/api/bookings", json=payload()).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(book, range(2))) == [201, 409]
    with connect() as conn:
        assert (
            conn.execute("SELECT count(*) AS n FROM bookings WHERE NOT cancelled").fetchone()["n"]
            == 1
        )


def test_database_exclusion_independent_of_api(db):
    barrier = Barrier(2)

    def insert(_):
        booking_id = uuid4()
        for attempt in range(2):
            try:
                with connect() as conn:
                    if attempt == 0:
                        barrier.wait(timeout=10)
                    conn.execute(
                        """INSERT INTO bookings (id,service_id,starts_at,ends_at,occupied_until,name,email,cancel_hash)
                        VALUES (%s,'consulting',%s::timestamptz,%s::timestamptz+interval '60 minutes',%s::timestamptz+interval '75 minutes','Demo','demo@example.com','hash')""",
                        (booking_id, f"{day()} 09:00-03", f"{day()} 09:00-03", f"{day()} 09:00-03"),
                    )
                return "created"
            except psycopg.errors.ExclusionViolation:
                return "conflict"
            except psycopg.errors.DeadlockDetected:
                # Direct concurrent exclusion checks can deadlock. Retry only
                # the aborted transaction: the committed winner must still
                # force an ExclusionViolation. API writes use an advisory lock.
                if attempt == 1:
                    raise
        raise AssertionError("Transaction did not complete")

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(insert, range(2))) == ["conflict", "created"]
    with connect() as conn:
        assert (
            conn.execute("SELECT count(*) AS n FROM bookings WHERE NOT cancelled").fetchone()["n"]
            == 1
        )


def test_overlap_buffer_and_cancellation(db):
    with TestClient(app) as client:
        first = client.post("/api/bookings", json=payload()).json()
        assert client.post("/api/bookings", json=payload("10:00", "discovery")).status_code == 409
        assert client.post("/api/bookings", json=payload("10:30", "discovery")).status_code == 201
        assert (
            client.delete(
                f"/api/bookings/{first['id']}", headers={"X-Cancel-Token": "x" * 43}
            ).status_code
            == 404
        )
        assert (
            client.delete(
                f"/api/bookings/{first['id']}",
                headers={"X-Cancel-Token": first["cancelToken"]},
            ).status_code
            == 204
        )
        assert client.post("/api/bookings", json=payload()).status_code == 201


def test_reschedule_rollback_and_token(db):
    with TestClient(app) as client:
        a = client.post("/api/bookings", json=payload()).json()
        client.post("/api/bookings", json=payload("11:00"))
        url = f"/api/bookings/{a['id']}"
        assert (
            client.put(
                url,
                headers={"X-Cancel-Token": "x" * 43},
                json={"date": day(), "time": "13:00"},
            ).status_code
            == 404
        )
        assert (
            client.put(
                url,
                headers={"X-Cancel-Token": a["cancelToken"]},
                json={"date": day(), "time": "11:00"},
            ).status_code
            == 409
        )
        with connect() as conn:
            assert (
                conn.execute("SELECT starts_at FROM bookings WHERE id=%s", (a["id"],))
                .fetchone()["starts_at"]
                .hour
                == 12
            )
        response = client.put(
            url,
            headers={"X-Cancel-Token": a["cancelToken"]},
            json={"date": day(), "time": "13:00"},
        )
        assert response.status_code == 200
        assert response.json()["time"] == "13:00"


def test_admin_auth_origin_logout(db):
    with TestClient(app) as client:
        assert client.get("/api/admin/bookings").status_code == 401
        assert (
            client.post("/api/admin/login", json={"password": "test-password-long"}).status_code
            == 403
        )
        assert (
            client.post("/api/admin/login", headers=ORIGIN, json={"password": "wrong"}).status_code
            == 401
        )
        response = client.post(
            "/api/admin/login", headers=ORIGIN, json={"password": "test-password-long"}
        )
        assert response.status_code == 204
        assert "HttpOnly" in response.headers["set-cookie"]
        assert client.get("/api/admin/bookings").status_code == 200
        data = dict(weekdays=[0, 1, 2, 3, 4], opens="10:00", closes="16:00")
        assert client.put("/api/admin/hours", json=data).status_code == 403
        assert client.put("/api/admin/hours", headers=ORIGIN, json=data).status_code == 200
        assert client.post("/api/admin/logout", headers=ORIGIN).status_code == 204
        assert client.get("/api/admin/bookings").status_code == 401


def test_hours_preserve_existing_bookings_and_migration(db):
    with TestClient(app) as client:
        client.post("/api/bookings", json=payload())
        client.post("/api/admin/login", headers=ORIGIN, json={"password": "test-password-long"})
        assert (
            client.put(
                "/api/admin/hours",
                headers=ORIGIN,
                json=dict(weekdays=[0, 1, 2, 3, 4], opens="10:00", closes="17:00"),
            ).status_code
            == 409
        )
        assert (
            client.put(
                "/api/admin/hours",
                headers=ORIGIN,
                json=dict(weekdays=[0, 1, 2, 3, 4, 5], opens="09:00", closes="17:00"),
            ).status_code
            == 200
        )
        migrate()
        assert len(client.get("/api/admin/hours").json()) == 6


def test_login_rate_limit(db):
    with TestClient(app) as client:
        for _ in range(5):
            assert (
                client.post(
                    "/api/admin/login", headers=ORIGIN, json={"password": "wrong"}
                ).status_code
                == 401
            )
        assert (
            client.post("/api/admin/login", headers=ORIGIN, json={"password": "wrong"}).status_code
            == 429
        )


def test_dates_and_private_responses(db):
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/bookings", json={**payload(), "date": today().isoformat()}
            ).status_code
            == 422
        )
        assert client.post("/api/bookings", json=payload("08:00")).status_code == 422
        r = client.get("/api/availability", params={"date": day(), "serviceId": "consulting"})
        assert r.status_code == 200
        assert r.headers["cache-control"] == "no-store"
        assert isinstance(r.json(), list)
