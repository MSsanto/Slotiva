import getpass
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from .db import connect


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"{salt}:{value}"


def verify_password(password: str) -> bool:
    stored = os.environ.get("ADMIN_PASSWORD_HASH", "")
    if not stored:
        raise HTTPException(503, "Acesso administrativo não configurado.")
    try:
        return hmac.compare_digest(password_hash(password, stored.split(":")[0]), stored)
    except ValueError:
        raise HTTPException(503, "Acesso administrativo não configurado.")


def trusted_origin(request: Request):
    allowed = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if request.headers.get("origin") not in allowed:
        raise HTTPException(403, "Origem não autorizada.")


def require_admin(request: Request):
    token = request.cookies.get("slotiva_session", "")
    with connect() as conn:
        session = conn.execute(
            "SELECT 1 FROM sessions WHERE token_hash=%s AND expires_at > now()",
            (digest(token),),
        ).fetchone()
    if not session:
        raise HTTPException(401, "Entre para acessar a agenda.")


def login(request: Request, password: str) -> str:
    trusted_origin(request)
    key = digest(request.client.host if request.client else "unknown")
    # Record attempts before checking the password, atomically across workers.
    with connect() as conn:
        row = conn.execute(
            """INSERT INTO login_attempts VALUES (%s, 1, now())
            ON CONFLICT (client_key) DO UPDATE SET
            attempts=CASE WHEN login_attempts.started_at < now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,
            started_at=CASE WHEN login_attempts.started_at < now()-interval '15 minutes' THEN now() ELSE login_attempts.started_at END
            RETURNING attempts""",
            (key,),
        ).fetchone()
    if row["attempts"] > 5:
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
    if not verify_password(password):
        raise HTTPException(401, "Senha inválida.")
    token = secrets.token_urlsafe(32)
    with connect() as conn:
        conn.execute("DELETE FROM login_attempts WHERE client_key=%s", (key,))
        conn.execute("DELETE FROM sessions WHERE expires_at <= now()")
        conn.execute(
            "INSERT INTO sessions VALUES (%s,%s)",
            (digest(token), datetime.now(timezone.utc) + timedelta(hours=8)),
        )
    return token


if __name__ == "__main__":
    password = getpass.getpass("Admin password (12+ characters): ")
    if len(password) < 12:
        raise SystemExit("Use at least 12 characters.")
    print(password_hash(password))
