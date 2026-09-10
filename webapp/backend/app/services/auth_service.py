from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import verify_password
from app.models.user import AppAuthAuditLog, AppUser

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _log_event(db: Session, event: str, ip_address: str | None, user: AppUser | None = None, employee_id: str | None = None) -> None:
    db.add(
        AppAuthAuditLog(
            user_id=user.user_id if user else None,
            employee_id=employee_id or (user.employee_id if user else None),
            event=event,
            ip_address=ip_address,
        )
    )


def authenticate_user(db: Session, employee_id: str, password: str, ip_address: str | None) -> AppUser:
    # Tags every write this request session makes with 'webapp:<employee_id>' so the generic
    # audit_log trigger (db/migration_2026-08-26_audit_log.sql) can attribute it - one of only two
    # places FastAPI writes to Postgres directly (the other is admin.py's account creation; rule
    # 23: everything else proxies to n8n, which tags its own writes 'n8n:<workflow>'). SET LOCAL
    # scopes it to this transaction only.
    db.execute(text("SET LOCAL app.actor = :actor"), {"actor": f"webapp:{employee_id}"})
    user = db.query(AppUser).filter(AppUser.employee_id == employee_id).first()

    if user is None:
        _log_event(db, "login_failure", ip_address, employee_id=employee_id)
        db.commit()
        raise ValueError("Invalid employee id or password")

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        _log_event(db, "lockout", ip_address, user=user)
        db.commit()
        raise ValueError(f"Account locked until {user.locked_until.isoformat()}")

    if not user.is_active or not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
            user.failed_login_count = 0
            _log_event(db, "lockout", ip_address, user=user)
        else:
            _log_event(db, "login_failure", ip_address, user=user)
        db.commit()
        raise ValueError("Invalid employee id or password")

    user.failed_login_count = 0
    user.last_login_at = datetime.now(timezone.utc)
    _log_event(db, "login_success", ip_address, user=user)
    db.commit()
    db.refresh(user)
    return user
