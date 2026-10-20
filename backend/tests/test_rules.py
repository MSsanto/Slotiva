from datetime import date, time, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from slotiva import services
from slotiva.models import BookingInput, HoursInput
from slotiva.security import password_hash, verify_password


def test_password_hash(monkeypatch):
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", password_hash("test-password-long"))
    assert verify_password("test-password-long")
    assert not verify_password("wrong")


def test_window_uses_professional_timezone(monkeypatch):
    monkeypatch.setattr(services, "today", lambda: date(2026, 11, 2))
    start, end, until = services.window(date(2026, 11, 3), time(9), "consulting")
    assert start.utcoffset() == timedelta(hours=-3)
    assert end - start == timedelta(hours=1)
    assert until - end == timedelta(minutes=15)


@pytest.mark.parametrize(
    "day,at",
    [
        (date(2026, 11, 2), time(9)),
        (date(2026, 11, 17), time(9)),
        (date(2026, 11, 3), time(9, 0, 1)),
    ],
)
def test_rejects_invalid_booking_window(monkeypatch, day, at):
    monkeypatch.setattr(services, "today", lambda: date(2026, 11, 2))
    with pytest.raises(HTTPException):
        services.window(day, at, "discovery")


def test_contact_validation():
    with pytest.raises(ValidationError):
        BookingInput(
            serviceId="discovery",
            date="2026-11-03",
            time="09:00",
            name=" ",
            email="invalid",
        )


def test_duplicate_weekdays_rejected():
    with pytest.raises(ValidationError):
        HoursInput(weekdays=[1, 1], opens="09:00", closes="17:00")
