from datetime import date, time
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class BookingInput(InputModel):
    serviceId: str
    date: date
    time: time
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr = Field(max_length=200)


class RescheduleInput(InputModel):
    date: date
    time: time


class LoginInput(InputModel):
    password: str = Field(min_length=1, max_length=200)
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=False)


class HoursInput(InputModel):
    weekdays: list[int] = Field(min_length=1, max_length=7)
    opens: time
    closes: time

    @field_validator('weekdays')
    @classmethod
    def valid_weekdays(cls, value):
        if len(value) != len(set(value)) or any(day not in range(7) for day in value):
            raise ValueError('Use dias únicos de 0 (segunda) a 6 (domingo).')
        return value
