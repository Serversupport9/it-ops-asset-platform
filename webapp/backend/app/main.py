from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1 import admin, auth, dashboard, password_reset, requests
from app.core.config import settings
from app.core.security import limiter

app = FastAPI(title="IT Ops Web App")

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(requests.router)
app.include_router(admin.router)
app.include_router(password_reset.router)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
