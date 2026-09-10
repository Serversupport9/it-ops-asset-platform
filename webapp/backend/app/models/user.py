import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class AppUser(Base):
    __tablename__ = "app_users"
    # Kept in sync with db/migration_2026-08-25_super_admin_role.sql's real DB-level constraint -
    # this ORM declaration isn't itself enforced (SQLAlchemy doesn't alter existing tables to
    # match it), but was found stale (missing 'super_admin') while building the admin employee-
    # creation endpoint, so fixed here too rather than left misleading.
    __table_args__ = (CheckConstraint("role IN ('employee','it','management','super_admin')", name="app_users_role_check"),)

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # No ForeignKey("employees.employee_id") declared here: this project's ORM layer only
    # maps app_users/app_auth_audit_log, not the full itops schema, so SQLAlchemy can't
    # resolve a cross-table FK target it doesn't know about. The real FK constraint already
    # exists at the database level (see the migration) and Postgres still enforces it.
    employee_id = Column(Text, unique=True)
    role = Column(Text, nullable=False)
    password_hash = Column(Text, nullable=False)
    mfa_enabled = Column(Boolean, nullable=False, default=False)
    mfa_secret_enc = Column(LargeBinary)
    is_active = Column(Boolean, nullable=False, default=True)
    failed_login_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True))
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class AppAuthAuditLog(Base):
    __tablename__ = "app_auth_audit_log"

    log_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_users.user_id"))
    employee_id = Column(Text)
    event = Column(Text)
    ip_address = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
