import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, limiter
from app.db.session import get_db
from app.models.user import AppAuthAuditLog

router = APIRouter(prefix="/api/v1/auth/password-reset", tags=["auth"])

TOKEN_TTL_MINUTES = 20
MIN_PASSWORD_LENGTH = 12
GENERIC_MESSAGE = "If this account exists and has an email on file, a reset link has been sent."


class PasswordResetRequest(BaseModel):
    employee_id: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _log(db: Session, event: str, ip_address: str | None, user_id=None, employee_id: str | None = None) -> None:
    db.add(AppAuthAuditLog(user_id=user_id, employee_id=employee_id, event=event, ip_address=ip_address))


async def _send_reset_email(email: str, name: str, reset_link: str) -> None:
    # Sent via n8n (same Gmail credential the digests use), not FastAPI - matches the project conventions
    # rule 17 (n8n owns external side effects) and avoids a second SMTP secret to manage.
    # Failures are deliberately swallowed - the caller-facing response must stay generic
    # regardless of whether the send actually succeeded (the project conventions rule "never leak account
    # existence").
    url = f"{settings.n8n_webhook_base}/portal-password-reset-email"
    headers = {"X-Webhook-Secret": settings.n8n_webhook_shared_secret}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(url, json={"email": email, "name": name, "reset_link": reset_link}, headers=headers)
    except httpx.RequestError:
        pass


@router.post("/request")
@limiter.limit("5/minute")
async def request_reset(request: Request, body: PasswordResetRequest, db: Session = Depends(get_db)):
    employee_id = body.employee_id.strip().upper()
    client_ip = request.client.host if request.client else None

    row = db.execute(
        text("""
            SELECT au.user_id, au.employee_id, e.email, e.name
            FROM app_users au JOIN employees e ON e.employee_id = au.employee_id
            WHERE au.employee_id = :eid AND au.is_active = true
        """),
        {"eid": employee_id},
    ).first()

    if row and row.email:
        # Invalidate any earlier unused link for this account - only the newest request stays valid.
        db.execute(
            text("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = :uid AND used_at IS NULL"),
            {"uid": row.user_id},
        )
        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES)
        db.execute(
            text("""
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
                VALUES (:uid, :th, :exp, :ip)
            """),
            {"uid": row.user_id, "th": _hash_token(raw_token), "exp": expires_at, "ip": client_ip},
        )
        _log(db, "password_reset_requested", client_ip, user_id=row.user_id, employee_id=row.employee_id)
        db.commit()

        reset_link = f"{settings.frontend_base_url}/reset-password/confirm?token={raw_token}"
        await _send_reset_email(row.email, row.name, reset_link)

    # Same response whether or not an account/email was found - avoids leaking account existence.
    return {"message": GENERIC_MESSAGE}


@router.post("/confirm")
@limiter.limit("10/minute")
async def confirm_reset(request: Request, body: PasswordResetConfirm, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else None

    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    row = db.execute(
        text("""
            SELECT prt.token_id, prt.user_id, prt.expires_at, prt.used_at, au.employee_id
            FROM password_reset_tokens prt JOIN app_users au ON au.user_id = prt.user_id
            WHERE prt.token_hash = :th
        """),
        {"th": _hash_token(body.token)},
    ).first()

    if not row or row.used_at is not None or row.expires_at < datetime.now(timezone.utc):
        _log(
            db, "password_reset_failed", client_ip,
            user_id=row.user_id if row else None, employee_id=row.employee_id if row else None,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link.")

    db.execute(text("SET LOCAL app.actor = :actor"), {"actor": f"webapp:{row.employee_id}"})
    db.execute(
        text("""
            UPDATE app_users SET password_hash = :ph, failed_login_count = 0, locked_until = NULL, updated_at = now()
            WHERE user_id = :uid
        """),
        {"ph": hash_password(body.new_password), "uid": row.user_id},
    )
    db.execute(text("UPDATE password_reset_tokens SET used_at = now() WHERE token_id = :tid"), {"tid": row.token_id})
    _log(db, "password_reset_success", client_ip, user_id=row.user_id, employee_id=row.employee_id)
    db.commit()

    return {"message": "Password reset successful. You can now log in."}
