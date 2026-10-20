import hmac
import secrets
from datetime import date, datetime, time, timedelta
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from .db import connect
from .models import BookingInput, HoursInput, RescheduleInput
from .security import digest

TZ = ZoneInfo("America/Sao_Paulo")
BUFFER = timedelta(minutes=15)
SERVICES = [
    dict(
        id="discovery",
        name="Conversa inicial",
        description="Um primeiro encontro para entender seus objetivos.",
        duration=30,
        price=0,
    ),
    dict(
        id="consulting",
        name="Consultoria individual",
        description="Tempo dedicado para transformar ideias em próximos passos.",
        duration=60,
        price=150,
    ),
    dict(
        id="review",
        name="Sessão de acompanhamento",
        description="Revise o progresso e ajuste a direção.",
        duration=45,
        price=100,
    ),
]


def today():
    return datetime.now(TZ).date()


def service_for(service_id: str):
    service = next((s for s in SERVICES if s["id"] == service_id), None)
    if not service:
        raise HTTPException(422, "Serviço inválido.")
    return service


def window(day: date, at: time, service_id: str):
    if (
        at.tzinfo
        or at.second
        or at.microsecond
        or not today() < day <= today() + timedelta(days=14)
    ):
        raise HTTPException(422, "Escolha uma data nos próximos 14 dias e um horário válido.")
    start = datetime.combine(day, at, TZ)
    end = start + timedelta(minutes=service_for(service_id)["duration"])
    return start, end, end + BUFFER


def validate_hours(conn, start, occupied_until):
    # Lock coordinates bookings with administrative schedule changes.
    conn.execute("SELECT pg_advisory_xact_lock(741053)")
    hours = conn.execute(
        "SELECT * FROM weekly_hours WHERE weekday=%s", (start.weekday(),)
    ).fetchone()
    if not hours:
        raise HTTPException(422, "Dia sem atendimento.")
    opening = datetime.combine(start.date(), hours["opens"], TZ)
    closing = datetime.combine(start.date(), hours["closes"], TZ)
    if start < opening or occupied_until > closing or (start - opening).total_seconds() % 1800:
        raise HTTPException(422, "Horário fora da disponibilidade.")


def serialize(row):
    local = row["starts_at"].astimezone(TZ)
    return dict(
        id=str(row["id"]),
        serviceId=row["service_id"],
        date=local.date().isoformat(),
        time=local.strftime("%H:%M"),
        name=row["name"],
        email=row["email"],
    )


def availability(day: date, service_id: str):
    service_for(service_id)
    if not today() < day <= today() + timedelta(days=14):
        raise HTTPException(422, "Data fora dos próximos 14 dias.")
    with connect() as conn:
        hours = conn.execute(
            "SELECT * FROM weekly_hours WHERE weekday=%s", (day.weekday(),)
        ).fetchone()
        if not hours:
            return []
        occupied = conn.execute(
            "SELECT starts_at, occupied_until FROM bookings WHERE NOT cancelled AND starts_at >= %s AND starts_at < %s",
            (
                datetime.combine(day, time.min, TZ),
                datetime.combine(day + timedelta(days=1), time.min, TZ),
            ),
        ).fetchall()
    start = datetime.combine(day, hours["opens"], TZ)
    close = datetime.combine(day, hours["closes"], TZ)
    result = []
    while start + timedelta(minutes=service_for(service_id)["duration"]) + BUFFER <= close:
        finish = start + timedelta(minutes=service_for(service_id)["duration"]) + BUFFER
        if not any(start < b["occupied_until"] and finish > b["starts_at"] for b in occupied):
            result.append(start.strftime("%H:%M"))
        start += timedelta(minutes=30)
    return result


def create_booking(data: BookingInput):
    start, end, until = window(data.date, data.time, data.serviceId)
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        validate_hours(conn, start, until)
        row = conn.execute(
            """INSERT INTO bookings (id,service_id,starts_at,ends_at,occupied_until,name,email,cancel_hash)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                uuid4(),
                data.serviceId,
                start,
                end,
                until,
                data.name,
                str(data.email),
                digest(token),
            ),
        ).fetchone()
    return {**serialize(row), "cancelToken": token}


def customer_booking(conn, booking_id: UUID, token: str):
    row = conn.execute(
        "SELECT * FROM bookings WHERE id=%s AND NOT cancelled FOR UPDATE", (booking_id,)
    ).fetchone()
    if not row or not hmac.compare_digest(row["cancel_hash"], digest(token)):
        raise HTTPException(404, "Reserva não encontrada.")
    return row


def cancel_booking(booking_id: UUID, token: str | None = None):
    with connect() as conn:
        if token is not None:
            customer_booking(conn, booking_id, token)
        row = conn.execute(
            "UPDATE bookings SET cancelled=true WHERE id=%s AND NOT cancelled RETURNING id",
            (booking_id,),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Reserva não encontrada.")


def reschedule(booking_id: UUID, token: str, data: RescheduleInput):
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(741053)")
        row = customer_booking(conn, booking_id, token)
        start, end, until = window(data.date, data.time, row["service_id"])
        validate_hours(conn, start, until)
        row = conn.execute(
            "UPDATE bookings SET starts_at=%s, ends_at=%s, occupied_until=%s WHERE id=%s RETURNING *",
            (start, end, until, booking_id),
        ).fetchone()
    return {**serialize(row), "cancelToken": token}


def list_bookings():
    with connect() as conn:
        return [
            serialize(row)
            for row in conn.execute(
                "SELECT * FROM bookings WHERE NOT cancelled ORDER BY starts_at"
            ).fetchall()
        ]


def get_hours():
    with connect() as conn:
        return [
            dict(
                weekday=r["weekday"],
                opens=r["opens"].strftime("%H:%M"),
                closes=r["closes"].strftime("%H:%M"),
            )
            for r in conn.execute("SELECT * FROM weekly_hours ORDER BY weekday").fetchall()
        ]


def update_hours(data: HoursInput):
    if (
        data.opens.tzinfo
        or data.closes.tzinfo
        or data.opens >= data.closes
        or any(t.second or t.microsecond or t.minute % 30 for t in (data.opens, data.closes))
    ):
        raise HTTPException(422, "Use um intervalo válido em incrementos de 30 minutos.")
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(741053)")
        active = conn.execute(
            "SELECT starts_at,occupied_until FROM bookings WHERE NOT cancelled AND occupied_until > now()"
        ).fetchall()
        for row in active:
            start, end = (
                row["starts_at"].astimezone(TZ),
                row["occupied_until"].astimezone(TZ),
            )
            if (
                start.weekday() not in data.weekdays
                or start.time() < data.opens
                or end.time() > data.closes
            ):
                raise HTTPException(
                    409,
                    "Existem reservas fora do novo expediente. Reagende ou cancele antes de alterar.",
                )
        conn.execute("DELETE FROM weekly_hours")
        for day in data.weekdays:
            conn.execute(
                "INSERT INTO weekly_hours VALUES (%s,%s,%s)",
                (day, data.opens, data.closes),
            )
    return get_hours()
