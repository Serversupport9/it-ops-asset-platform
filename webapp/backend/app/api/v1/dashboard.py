import time

from fastapi import APIRouter, Depends
from jose import jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.auth import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.user import AppUser

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

EMBED_TOKEN_TTL_SECONDS = 600


@router.get("/embed-url")
def get_embed_url(_: AppUser = Depends(get_current_user)):
    payload = {
        "resource": {"dashboard": settings.metabase_dashboard_id},
        "params": {},
        "exp": round(time.time()) + EMBED_TOKEN_TTL_SECONDS,
    }
    token = jwt.encode(payload, settings.metabase_embed_secret, algorithm="HS256")
    return {"embed_url": f"{settings.metabase_site_url}/embed/dashboard/{token}#bordered=true&titled=true"}


@router.get("/summary")
def get_summary(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """KPI cards for the portal's own Dashboard page (native, not Metabase). total_asset_units is
    SUM(qty) per the project conventions rule 12 (bundle rows); every other count stays row-based, same rule -
    custody/queue counts operate per row regardless of bundle size."""
    totals = db.execute(text("""
        SELECT
            COALESCE(SUM(qty), 0) AS total_asset_units,
            COUNT(*) FILTER (WHERE asset_status = 'available') AS available_count,
            COUNT(*) FILTER (WHERE asset_status = 'in_use') AS in_use_count,
            COUNT(*) FILTER (WHERE asset_status = 'pending_return') AS pending_return_count,
            COUNT(*) FILTER (WHERE is_high_value) AS high_value_count
        FROM assets
    """)).mappings().one()

    unfulfilled_requests = db.execute(
        text("SELECT count(*) FROM asset_requests WHERE status = 'submitted'")
    ).scalar_one()
    pending_approvals = db.execute(
        text("SELECT count(*) FROM asset_allocations WHERE status = 'pending'")
    ).scalar_one()
    open_rental_risk = db.execute(
        text("SELECT count(*) FROM rental_risk_flags WHERE status = 'open'")
    ).scalar_one()
    open_offboarding_risk = db.execute(
        text("SELECT count(*) FROM offboarding_risk_flags WHERE status = 'open'")
    ).scalar_one()

    return {
        **dict(totals),
        "unfulfilled_requests": unfulfilled_requests,
        "pending_approvals": pending_approvals,
        "open_rental_risk": open_rental_risk,
        "open_offboarding_risk": open_offboarding_risk,
    }
