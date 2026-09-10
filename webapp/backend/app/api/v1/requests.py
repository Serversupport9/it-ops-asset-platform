import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user, require_role
from app.core.config import settings
from app.db.session import get_db
from app.models.user import AppUser

router = APIRouter(prefix="/api/v1", tags=["requests"])

# Role model (the product owner, 2026-08-25): "it" has full visibility but cannot decide on requests -
# Approve/Reject is management/super_admin only. See db/migration_2026-08-25_super_admin_role.sql.
ADMIN_ROLES = ("it", "management", "super_admin")
APPROVER_ROLES = ("management", "super_admin")
DECISION_LOG_ACTIONS = (
    "submitted", "fulfilled", "needs_purchase", "approved", "rejected", "returned", "lost", "written_off",
)


class RequestCreate(BaseModel):
    asset_id: str
    employee_id: str | None = None
    requested_qty: str | None = None
    expected_return_date: str | None = None
    condition_out: str | None = None
    notes: str | None = None


class ReturnCreate(BaseModel):
    asset_id: str
    employee_id: str | None = None
    condition_in: str
    notes: str | None = None


class DecisionBody(BaseModel):
    notes: str | None = None


class LostCreate(BaseModel):
    asset_id: str
    notes: str | None = None


class WriteOffCreate(BaseModel):
    asset_id: str
    condition_in: str | None = None
    notes: str | None = None


class AssetRequestCreate(BaseModel):
    """New request shape (the product owner, 2026-08-25): no asset_id - the employee asks for a device
    TYPE + qty, IT picks the specific asset later (see /asset-requests/{id}/fulfill)."""
    device_type_id: int
    requested_qty: int = 1
    purpose: str | None = None
    department: str | None = None
    needed_by_date: str | None = None
    asset_specification: str | None = None


class FulfillBody(BaseModel):
    asset_id: str
    notes: str | None = None


class HighValueBody(BaseModel):
    is_high_value: bool


async def call_n8n(webhook_path: str, payload: dict) -> Response:
    """Proxy to an n8n webhook-triggered workflow, which owns the actual business logic
    (validation + Postgres writes) — see the design notes for the workflow spec. FastAPI never
    runs this SQL itself; it only forwards the request and relays n8n's response as-is."""
    url = f"{settings.n8n_webhook_base}/{webhook_path}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach the n8n workflow at {webhook_path} — is it built and active?",
        ) from exc

    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


@router.post("/requests")
async def submit_request(body: RequestCreate, user: AppUser = Depends(get_current_user)):
    employee_id = body.employee_id if user.role in ADMIN_ROLES and body.employee_id else user.employee_id
    return await call_n8n("portal-request", {
        "asset_id": body.asset_id,
        "employee_id": employee_id,
        "requested_qty": body.requested_qty,
        "requested_by": user.employee_id,
        "expected_return_date": body.expected_return_date,
        "condition_out": body.condition_out,
        "notes": body.notes,
    })


@router.get("/decisions")
def list_decisions(
    action: str | None = None, user: AppUser = Depends(require_role(*ADMIN_ROLES)), db: Session = Depends(get_db)
):
    """Powers the Approvals page's status-filtered history view - backed by
    assignment_decision_log (trigger-populated, the design notes §Decision log), not a live query
    against asset_allocations, so it covers the full lifecycle including pre-fulfillment
    ('submitted') and parked ('needs_purchase') states, not just what's currently pending.

    'fulfilled' and 'submitted' are non-terminal - a request logged as 'submitted' may since have
    been fulfilled, and one logged as 'fulfilled' may since have been approved/rejected. Filtering
    to exactly one of those two tabs re-checks live status (asset_allocations/asset_requests) so
    the tab only shows what's *still* in that state, not stale historical events - caught during
    testing (an already-approved allocation still showing Approve/Reject buttons under Pending).
    The unfiltered 'All' view and the terminal-action tabs (approved/rejected/needs_purchase/
    returned) show the raw log as-is, since those events don't get superseded the same way."""
    if action is not None and action not in DECISION_LOG_ACTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown action filter: {action}")
    rows = db.execute(text("""
        SELECT adl.log_id, adl.request_id, adl.allocation_id, adl.asset_id, adl.employee_id,
               e.name AS employee_name, adl.device_type_id, dt.name AS device_type_name,
               adl.asset_specification, adl.requested_qty, adl.action, adl.decided_by, adl.notes,
               adl.request_date, adl.decision_date,
               count(*) OVER () AS total_matching
        FROM assignment_decision_log adl
        LEFT JOIN employees e ON e.employee_id = adl.employee_id
        LEFT JOIN device_types dt ON dt.device_type_id = adl.device_type_id
        LEFT JOIN asset_allocations al ON al.allocation_id = adl.allocation_id
        LEFT JOIN asset_requests r ON r.request_id = adl.request_id
        WHERE (:action IS NULL OR adl.action = :action)
          AND (:action IS DISTINCT FROM 'fulfilled' OR al.status = 'pending')
          AND (:action IS DISTINCT FROM 'submitted' OR r.status = 'submitted')
        ORDER BY adl.decision_date DESC NULLS LAST, adl.request_date DESC
        LIMIT 5000
    """), {"action": action}).mappings().all()
    total = rows[0]["total_matching"] if rows else 0
    return {"total": total, "items": [{k: v for k, v in r.items() if k != "total_matching"} for r in rows]}


@router.get("/requests/mine")
def list_mine(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    # One row per asset_requests entry (the new device-type-first flow) - status is the
    # allocation's real status once IT has fulfilled it (pending/active/rejected/returned),
    # falling back to the request's own pre-fulfillment status otherwise. No separate sync step
    # needed against the existing, unchanged Approve/Reject/Return workflows - this just reads
    # asset_allocations live via resulting_allocation_id.
    rows = db.execute(text("""
        SELECT r.request_id, dt.name AS device_type_name, r.requested_qty, r.purpose,
               r.department, r.needed_by_date, r.asset_specification, r.created_at AS requested_at,
               al.allocation_id, al.asset_id, al.approved_at, al.returned_at,
               COALESCE(al.status, r.status) AS status
        FROM asset_requests r
        JOIN device_types dt ON dt.device_type_id = r.device_type_id
        LEFT JOIN asset_allocations al ON al.allocation_id = r.resulting_allocation_id
        WHERE r.employee_id = :employee_id
        ORDER BY r.created_at DESC
    """), {"employee_id": user.employee_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/device-types")
def list_device_types(user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT device_type_id, name FROM device_types ORDER BY name
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/my-assets")
def list_active_assets(
    employee_id: str | None = None, user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Powers both the Return Asset dropdown and the My Assets page - what someone currently has
    plus what they've recently handed back (al.status IN ('active','returned')), so My Assets can
    show a return date once IT has it back. The Return dropdown only wants what's still active -
    filtered client-side on allocation_status, since offering an already-returned asset there
    would let someone try to return it a second time. Self-service by default; it/management/
    super_admin may pass ?employee_id= to act on behalf of someone else, same behalf-of pattern as
    submit_request/submit_return. Returns full asset detail (brand/model/serial/office/status/
    warranty/high-value) - the Return dropdown only uses a few of these fields, My Assets uses
    all of them; one query serves both rather than duplicating the join."""
    target_employee_id = employee_id if user.role in ADMIN_ROLES and employee_id else user.employee_id
    rows = db.execute(text("""
        SELECT al.allocation_id, al.asset_id, dt.name AS device_type_name, al.allocated_at,
               al.condition_out, al.expected_return_date, al.status AS allocation_status,
               al.returned_at,
               a.brand, a.model, a.serial_number, a.asset_status, a.is_high_value,
               a.purchase_date, a.warranty_expiry, o.name AS office_name
        FROM asset_allocations al
        JOIN assets a ON a.asset_id = al.asset_id
        JOIN device_types dt ON dt.device_type_id = a.device_type_id
        LEFT JOIN offices o ON o.office_id = a.office_id
        WHERE al.employee_id = :employee_id AND al.status IN ('active', 'returned')
        ORDER BY al.allocated_at DESC
    """), {"employee_id": target_employee_id}).mappings().all()
    return [dict(r) for r in rows]


@router.post("/asset-requests")
async def submit_asset_request(body: AssetRequestCreate, user: AppUser = Depends(get_current_user)):
    return await call_n8n("portal-asset-request", {
        "employee_id": user.employee_id,
        "device_type_id": body.device_type_id,
        "requested_qty": body.requested_qty,
        "purpose": body.purpose,
        "department": body.department,
        "needed_by_date": body.needed_by_date,
        "asset_specification": body.asset_specification,
    })


@router.get("/assets/available")
def list_available_assets(
    device_type_id: int, user: AppUser = Depends(require_role(*ADMIN_ROLES)), db: Session = Depends(get_db)
):
    """Powers the Fulfillment page's asset picker (the design notes open item 1 - bundle/split-quantity
    fulfillment). Read-only lookup, no n8n involved (matches the pattern of every other GET here -
    rule 23's "n8n over FastAPI" is about business logic/writes, this is just a SELECT). Shows
    remaining qty per row so IT can see, before typing an asset_id, whether a bundle row
    (assets.qty > 1) has enough spare units for the request - Portal - Fulfill Asset Request splits
    the row automatically if IT picks one with more than it needs."""
    rows = db.execute(text("""
        SELECT a.asset_id, a.qty, a.brand, a.model, o.name AS office_name, a.split_from_asset_id
        FROM assets a
        LEFT JOIN offices o ON o.office_id = a.office_id
        WHERE a.device_type_id = :device_type_id AND a.asset_status = 'available'
        ORDER BY a.qty DESC, a.asset_id
    """), {"device_type_id": device_type_id}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/asset-requests/awaiting-approval")
def list_awaiting_approval(user: AppUser = Depends(require_role(*APPROVER_ROLES)), db: Session = Depends(get_db)):
    """Powers the Approvals page's new request-level gate (2026-08-28 WhatsApp early-approval-gate
    redesign) - management/super_admin approve/reject the raw request itself, before IT ever picks
    a unit. Replaces the old allocation-level 'Pending' step for anything going through this flow;
    see db/migration_2026-08-28_whatsapp_early_approval_gate.sql for the full rationale."""
    rows = db.execute(text("""
        SELECT r.request_id, r.employee_id, e.name AS employee_name, r.device_type_id,
               dt.name AS device_type_name, r.requested_qty, r.purpose, r.department,
               r.needed_by_date, r.asset_specification, r.created_at AS requested_at
        FROM asset_requests r
        JOIN device_types dt ON dt.device_type_id = r.device_type_id
        LEFT JOIN employees e ON e.employee_id = r.employee_id
        WHERE r.status = 'submitted'
        ORDER BY r.created_at ASC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/asset-requests/{request_id}/approve")
async def approve_asset_request(request_id: int, user: AppUser = Depends(require_role(*APPROVER_ROLES))):
    return await call_n8n("portal-approve-asset-request", {"request_id": request_id, "decided_by": user.employee_id})


@router.post("/asset-requests/{request_id}/reject")
async def reject_asset_request(
    request_id: int, body: DecisionBody, user: AppUser = Depends(require_role(*APPROVER_ROLES))
):
    return await call_n8n("portal-reject-asset-request", {
        "request_id": request_id, "decided_by": user.employee_id, "notes": body.notes,
    })


@router.get("/asset-requests/unfulfilled")
def list_unfulfilled(user: AppUser = Depends(require_role(*ADMIN_ROLES)), db: Session = Depends(get_db)):
    """Fulfillment page's queue - now gated on 'approved' (2026-08-28), not 'submitted': IT only
    picks a unit once management has approved the raw request via list_awaiting_approval above."""
    rows = db.execute(text("""
        SELECT r.request_id, r.employee_id, e.name AS employee_name, r.device_type_id,
               dt.name AS device_type_name, r.requested_qty, r.purpose, r.department,
               r.needed_by_date, r.asset_specification, r.created_at AS requested_at
        FROM asset_requests r
        JOIN device_types dt ON dt.device_type_id = r.device_type_id
        LEFT JOIN employees e ON e.employee_id = r.employee_id
        WHERE r.status = 'approved'
        ORDER BY r.created_at ASC
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/asset-requests/{request_id}/fulfill")
async def fulfill_asset_request(
    request_id: int, body: FulfillBody, user: AppUser = Depends(require_role(*ADMIN_ROLES))
):
    return await call_n8n("portal-fulfill-request", {
        "request_id": request_id,
        "asset_id": body.asset_id,
        "decided_by": user.employee_id,
        "notes": body.notes,
    })


@router.post("/asset-requests/{request_id}/needs-purchase")
async def mark_needs_purchase(
    request_id: int, body: DecisionBody, user: AppUser = Depends(require_role(*ADMIN_ROLES))
):
    return await call_n8n("portal-request-needs-purchase", {
        "request_id": request_id,
        "decided_by": user.employee_id,
        "notes": body.notes,
    })


@router.post("/requests/{allocation_id}/approve")
async def approve(allocation_id: int, user: AppUser = Depends(require_role(*APPROVER_ROLES))):
    return await call_n8n("portal-approve", {"allocation_id": allocation_id, "decided_by": user.employee_id})


@router.post("/requests/{allocation_id}/reject")
async def reject(allocation_id: int, body: DecisionBody, user: AppUser = Depends(require_role(*APPROVER_ROLES))):
    return await call_n8n("portal-reject", {
        "allocation_id": allocation_id, "decided_by": user.employee_id, "notes": body.notes,
    })


@router.post("/returns")
async def submit_return(body: ReturnCreate, user: AppUser = Depends(get_current_user)):
    employee_id = body.employee_id if user.role in ADMIN_ROLES and body.employee_id else user.employee_id
    return await call_n8n("portal-return", {
        "asset_id": body.asset_id,
        "employee_id": employee_id,
        "received_by": user.employee_id,
        "condition_in": body.condition_in,
        "notes": body.notes,
    })


@router.post("/returns/lost")
async def mark_lost(body: LostCreate, user: AppUser = Depends(require_role(*APPROVER_ROLES))):
    return await call_n8n("portal-mark-lost", {
        "asset_id": body.asset_id, "decided_by": user.employee_id, "notes": body.notes,
    })


@router.post("/returns/write-off")
async def write_off(body: WriteOffCreate, user: AppUser = Depends(require_role(*APPROVER_ROLES))):
    return await call_n8n("portal-write-off", {
        "asset_id": body.asset_id,
        "decided_by": user.employee_id,
        "condition_in": body.condition_in,
        "notes": body.notes,
    })


@router.get("/assets")
def list_assets(
    q: str | None = None,
    is_high_value: bool | None = None,
    user: AppUser = Depends(require_role(*ADMIN_ROLES)),
    db: Session = Depends(get_db),
):
    """Powers the Assets admin page (search + high-value toggle). q matches asset_id/brand/model/
    serial_number; is_high_value filters to just the flagged set. Read-only SELECT, no n8n involved
    - same rationale as list_available_assets above."""
    rows = db.execute(text("""
        SELECT a.asset_id, a.brand, a.model, a.serial_number, a.asset_status, a.is_high_value,
               dt.name AS device_type_name, o.name AS office_name,
               a.current_employee_id, e.name AS current_employee_name,
               count(*) OVER () AS total_matching
        FROM assets a
        LEFT JOIN device_types dt ON dt.device_type_id = a.device_type_id
        LEFT JOIN offices o ON o.office_id = a.office_id
        LEFT JOIN employees e ON e.employee_id = a.current_employee_id
        WHERE (:q IS NULL OR a.asset_id ILIKE '%' || :q || '%' OR a.brand ILIKE '%' || :q || '%'
               OR a.model ILIKE '%' || :q || '%' OR a.serial_number ILIKE '%' || :q || '%')
          AND (:is_high_value IS NULL OR a.is_high_value = :is_high_value)
        ORDER BY a.asset_id
        LIMIT 5000
    """), {"q": q, "is_high_value": is_high_value}).mappings().all()
    total = rows[0]["total_matching"] if rows else 0
    return {"total": total, "items": [{k: v for k, v in r.items() if k != "total_matching"} for r in rows]}


@router.post("/assets/{asset_id}/high-value")
async def set_high_value(
    asset_id: str, body: HighValueBody, user: AppUser = Depends(require_role(*ADMIN_ROLES))
):
    return await call_n8n("portal-toggle-high-value", {
        "asset_id": asset_id, "is_high_value": body.is_high_value,
    })
