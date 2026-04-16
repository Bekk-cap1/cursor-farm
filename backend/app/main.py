from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlmodel import Session

from app.api.routes_agent import router as agent_router
from app.api.routes_audit import router as audit_router
from app.api.routes_auth import router as auth_router
from app.api.routes_dashboard import router as dashboard_router
from app.api.routes_farm_members import router as farm_members_router
from app.api.routes_farms import router as farms_router
from app.api.routes_health import router as health_router
from app.api.routes_herds import router as herds_router
from app.api.routes_notifications import router as notifications_router
from app.api.routes_tasks import router as tasks_router
from app.api.routes_weather import router as weather_router
from app.api.routes_zones import router as zones_router
from app.config import settings
from app.db import engine, init_db
from app.limiter import limiter
from app.seed import ensure_demo_rich_data, ensure_memberships, seed_demo

_cors_default = ["http://127.0.0.1:5173", "http://localhost:5173"]
_cors_extra = [o.strip() for o in settings.cors_origins_extra.split(",") if o.strip()]
_cors_allow = list(dict.fromkeys([*_cors_default, *_cors_extra]))


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with Session(engine) as session:
        seed_demo(session)
        ensure_memberships(session)
        ensure_demo_rich_data(session)
    yield


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Платформа управления фермами и ИИ-агент (полив, стада, погода, задачи).",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Два префикса: обычный /api/... и тот же набор путей без /api, если прокси (Coolify и т.д.)
# пересылает на бэкенд уже без префикса /api.
_API_PREFIXES: tuple[str, ...] = ("/api", "")
_ALL_ROUTERS = (
    health_router,
    auth_router,
    farms_router,
    zones_router,
    herds_router,
    tasks_router,
    weather_router,
    agent_router,
    dashboard_router,
    notifications_router,
    audit_router,
    farm_members_router,
)
for _pfx in _API_PREFIXES:
    for _r in _ALL_ROUTERS:
        app.include_router(_r, prefix=_pfx)
