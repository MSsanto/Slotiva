import os

import pytest
from slotiva.db import connect, migrate
from slotiva.security import password_hash


@pytest.fixture
def db(monkeypatch):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL must point to an isolated PostgreSQL test database")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", password_hash("test-password-long"))
    monkeypatch.setenv("COOKIE_SECURE", "false")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173")
    migrate()
    with connect() as conn:
        conn.execute("TRUNCATE bookings,sessions,login_attempts,weekly_hours")
        conn.execute(
            "INSERT INTO weekly_hours SELECT day,'09:00'::time,'17:00'::time FROM generate_series(0,4) AS day"
        )
    yield
    with connect() as conn:
        conn.execute("TRUNCATE bookings,sessions,login_attempts")
