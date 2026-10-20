import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def connect():
    return psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row,
        connect_timeout=5,
        options="-c timezone=UTC",
    )


def migrate():
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(741052)")
        conn.execute(Path(__file__).with_name("schema.sql").read_text())


if __name__ == "__main__":
    migrate()
