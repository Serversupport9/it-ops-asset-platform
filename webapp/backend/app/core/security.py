from datetime import datetime, timedelta, timezone

from fastapi import Request
from jose import JWTError, jwt
from passlib.context import CryptContext
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def rate_limit_key(request: Request) -> str:
    # webapp-web's own nginx already sits in front of this service (nginx.conf.template proxies
    # /api/), and production adds Caddy as a second hop - get_remote_address alone would always
    # see the last proxy's Docker-internal IP, not the real client, making every rate limit apply
    # globally instead of per-client. X-Forwarded-For is a comma-separated list appended to by each
    # hop; the first entry is the original client. Falls back to the raw peer if the header is
    # ever missing (e.g. a direct, non-proxied request).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key)


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_token(subject: str, expires_delta: timedelta, extra_claims: dict | None = None) -> str:
    to_encode = {"sub": subject, "exp": datetime.now(timezone.utc) + expires_delta}
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str, role: str) -> str:
    return create_token(
        subject=user_id,
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        extra_claims={"role": role, "type": "access"},
    )


def create_refresh_token(user_id: str) -> str:
    return create_token(
        subject=user_id,
        expires_delta=timedelta(days=settings.refresh_token_expire_days),
        extra_claims={"type": "refresh"},
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid or expired token") from exc


# --- pgcrypto-backed column encryption -------------------------------------
# Encrypts/decrypts via Postgres' own pgcrypto extension (already installed in
# this project's Postgres) rather than doing crypto in application code. Used
# today only for app_users.mfa_secret_enc, which stays NULL until MFA ships --
# this proves the round trip works before there's a real secret to protect.

def encrypt_value(db: Session, plaintext: str) -> bytes:
    result = db.execute(
        text("SELECT pgp_sym_encrypt(:plaintext, :key) AS ciphertext"),
        {"plaintext": plaintext, "key": settings.db_enc_key},
    ).one()
    return result.ciphertext


def decrypt_value(db: Session, ciphertext: bytes) -> str:
    result = db.execute(
        text("SELECT pgp_sym_decrypt(:ciphertext, :key) AS plaintext"),
        {"ciphertext": ciphertext, "key": settings.db_enc_key},
    ).one()
    return result.plaintext
