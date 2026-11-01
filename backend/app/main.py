"""FastAPI 应用入口。
- 提供 /api/* 业务接口（后续 router 挂载在 mount 静态之前，保证优先匹配）
- 托管前端静态文件（index.html / css / js / 截图 png），上线后单 URL 可用
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Staff
from app.routers import (
    auth, state, bookings, reception, billing, rooms, housekeeping, settings as settings_router, guests,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动即建表；若 staff 表为空（首次部署 / 全新数据库），灌入演示数据
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        try:
            empty = db.query(func.count(Staff.id)).scalar() == 0
        except Exception:
            empty = True
    if empty:
        from app.seed import seed
        seed()
    yield


app = FastAPI(title="云澜 PMS API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "yunlan-pms"}


# ---- 业务路由：必须在静态 mount("/") 之前注册，否则会被静态兜底吞掉 ----
for _r in (auth, state, bookings, reception, billing, rooms, housekeeping, settings_router, guests):
    app.include_router(_r.router)


# ---- 前端静态托管（最后兜底）----
_frontend = Path(settings.frontend_dir)
if not _frontend.is_absolute():
    from app.config import PROJECT_ROOT
    _frontend = (PROJECT_ROOT / settings.frontend_dir).resolve()
if _frontend.exists():
    app.mount(
        "/",
        StaticFiles(directory=str(_frontend), html=True),
        name="static",
    )
