import secrets
import string

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.auth import require_role
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import AppUser

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Onboarding is reactive, not proactive (Serversupport9, 2026-08-26 - the design notes open item 1):
# there is no automated new-hire intake. IT creates one employees row + one app_users login when
# a new joinee first needs an asset, and shares the credentials. This endpoint replaces the direct
# SQL that was the only way to do this before (even the product owner's own account was created that way).
ADMIN_ROLES = ("it", "management", "super_admin")
APPROVER_ROLES = ("management", "super_admin")
VALID_ROLES = ("employee", "it", "management", "super_admin")


class CreateEmployeeLogin(BaseModel):
    employee_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    department: str | None = None
    designation: str | None = None
    date_of_joining: str | None = None
    role: str = "employee"


class ChangeRole(BaseModel):
    role: str


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _generate_temp_password() -> str:
    # Server-generated, never typed by IT - avoids weak/guessable passwords. 16 chars, mixed
    # alphabet+digits+a guaranteed symbol, matching this project's own secret strength (.env
    # passwords are all 14-16 char mixed case/digit/symbol).
    alphabet = string.ascii_letters + string.digits
    body = "".join(secrets.choice(alphabet) for _ in range(15))
    return body + secrets.choice("!@#$%^&*")


@router.post("/employees")
def create_employee_login(
    body: CreateEmployeeLogin,
    user: AppUser = Depends(require_role(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role: {body.role}")
    # Privilege-escalation guard: 'it' has full visibility but never decision authority (same
    # boundary as Approve/Reject) - it must not be able to hand itself or anyone else an
    # 'it'/'management'/'super_admin' login. Only management/super_admin can create elevated roles.
    if role != "employee" and user.role not in APPROVER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only management/super_admin can create it/management/super_admin logins - 'it' can only create employee-role accounts.",
        )

    employee_id = body.employee_id.strip().upper()
    if not employee_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="employee_id is required")

    # Tags this write 'webapp:<the admin creating the account>' for audit_log, matching the only
    # other place FastAPI writes directly (auth_service.authenticate_user) - the project conventions rule 21.
    db.execute(text("SET LOCAL app.actor = :actor"), {"actor": f"webapp:{user.employee_id}"})

    existing_login = db.execute(
        text("SELECT user_id FROM app_users WHERE employee_id = :eid"), {"eid": employee_id}
    ).first()
    if existing_login:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=f"{employee_id} already has a portal login."
        )

    existing_employee = db.execute(
        text("SELECT employee_id FROM employees WHERE employee_id = :eid"), {"eid": employee_id}
    ).first()

    employee_created = False
    if not existing_employee:
        name = _clean(body.name)
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="name is required for a new employee_id."
            )
        db.execute(
            text("""
                INSERT INTO employees
                    (employee_id, name, email, phone, department, designation, date_of_joining,
                     employment_status, party_type)
                VALUES
                    (:eid, :name, :email, :phone, :department, :designation, :doj, 'active', 'person')
            """),
            {
                "eid": employee_id,
                "name": name,
                "email": _clean(body.email),
                "phone": _clean(body.phone),
                "department": _clean(body.department),
                "designation": _clean(body.designation),
                "doj": _clean(body.date_of_joining),
            },
        )
        employee_created = True
    # Existing employee_id: deliberately don't touch its row - same "never overwrite what the
    # caller doesn't own" discipline as the REV10 transform (the project conventions).

    temp_password = _generate_temp_password()
    db.execute(
        text("INSERT INTO app_users (employee_id, password_hash, role) VALUES (:eid, :ph, :role)"),
        {"eid": employee_id, "ph": hash_password(temp_password), "role": role},
    )
    db.commit()

    return {
        "employee_id": employee_id,
        "role": role,
        "employee_created": employee_created,
        "temporary_password": temp_password,
        "warning": "Shown once - not stored anywhere in plaintext. Share it securely and don't paste it anywhere it could be logged.",
    }


@router.get("/employees")
def list_employees(
    q: str | None = None,
    user: AppUser = Depends(require_role(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Powers the Roles admin page (2026-08-28) - every employee, with their current portal role
    if they have a login yet (NULL if not). Visibility for all of ADMIN_ROLES ('it' included,
    matching the Assets page's see-everything-decide-less pattern) - the actual role change below
    is restricted to APPROVER_ROLES."""
    rows = db.execute(text("""
        SELECT e.employee_id, e.name, e.department, e.designation, e.employment_status,
               au.role, au.is_active AS login_active
        FROM employees e
        LEFT JOIN app_users au ON au.employee_id = e.employee_id
        WHERE e.party_type = 'person'
          AND (:q IS NULL OR e.employee_id ILIKE '%' || :q || '%' OR e.name ILIKE '%' || :q || '%')
        ORDER BY e.name
        LIMIT 500
    """), {"q": q}).mappings().all()
    return [dict(r) for r in rows]


@router.patch("/employees/{employee_id}/role")
def change_role(
    employee_id: str,
    body: ChangeRole,
    user: AppUser = Depends(require_role(*APPROVER_ROLES)),
    db: Session = Depends(get_db),
):
    """Changes an EXISTING login's role - the Add Employee flow above only sets a role at
    creation time, this is the missing 'change it later' path (Serversupport9, 2026-08-28).
    Restricted to management/super_admin only, no 'it' exception here (unlike creation, where
    'it' may create employee-only logins) - changing an existing person's privilege level is more
    sensitive than onboarding a new employee-tier login, so this stays a strict APPROVER_ROLES gate."""
    role = body.role.strip().lower()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role: {body.role}")

    employee_id = employee_id.strip().upper()
    if employee_id == user.employee_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You can't change your own role - ask another management/super_admin user.",
        )

    db.execute(text("SET LOCAL app.actor = :actor"), {"actor": f"webapp:{user.employee_id}"})
    result = db.execute(
        text("UPDATE app_users SET role = :role, updated_at = now() WHERE employee_id = :eid RETURNING employee_id"),
        {"role": role, "eid": employee_id},
    ).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{employee_id} doesn't have a portal login yet."
        )
    db.commit()
    return {"employee_id": employee_id, "role": role}
