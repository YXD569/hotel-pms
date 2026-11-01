"""FastAPI 应用入口。
- 提供 /api/* 业务接口（后续 router 挂载在 mount 静态之前，保证优先匹配）
- 托管前端静态文件（index.html / css / js / 截图 png），上线后单 URL 可用
- 支持 `python app/main.py` 直接启动（VS Code 右上角「运行 Python 文件」按钮）
"""
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

# 以脚本方式运行本文件时（如 VS Code 点「运行 Python 文件」），
# sys.path[0] 是 app/ 而非 backend/，会导致下面的 `from app.*` 全部失败。
# 这里在导入 app 包之前把 backend/ 补进 sys.path；以模块方式导入时（uvicorn
# app.main:app）__package__ 为 "app"，此分支不执行，无副作用。
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import Staff
from app.routers import (
    auth, state, bookings, reception, billing, rooms, housekeeping, settings as settings_router, guests,
)

# uvicorn 只配置自己的 logger，不碰 root；不装 handler 的话本模块的 logger.info
# 会被 logging.lastResort（级别 WARNING）吞掉，启动横幅打不出来。
# 已有 handler 时 basicConfig 是空操作，重复导入无副作用。
logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
logger = logging.getLogger("pms")

# 生产环境必须替换的默认密钥（仅提示，不阻断启动）
DEFAULT_JWT_SECRETS = {"", "dev-secret-change-me", "dev-only-secret-please-change-in-production-32b"}


def _wait_for_db(attempts: int = 10, delay: float = 1.5) -> None:
    """启动前探测数据库连通性（容器编排下数据库常比应用晚就绪）。"""
    for i in range(attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if i == attempts - 1:
                raise
            logger.warning("数据库暂不可用，%.1fs 后重试（%d/%d）", delay, i + 1, attempts)
            time.sleep(delay)


def _startup_banner() -> None:
    """打印「浏览器该开哪个地址」。

    uvicorn 自己那行 "Uvicorn running on http://0.0.0.0:8000" 是**监听地址**，
    0.0.0.0 不是可访问地址，浏览器打开会直接 ERR_ADDRESS_INVALID。
    这里按实际启动参数换算成能点的地址，避免用户照抄第一行踩坑。
    """
    host, port = "127.0.0.1", "8000"
    argv = sys.argv
    for i, a in enumerate(argv):
        if a.startswith("--port="):
            port = a.split("=", 1)[1]
        elif a == "--port" and i + 1 < len(argv):
            port = argv[i + 1]
        elif a.startswith("--host="):
            host = a.split("=", 1)[1]
        elif a == "--host" and i + 1 < len(argv):
            host = argv[i + 1]
    shown = "localhost" if host in ("0.0.0.0", "::", "") else host
    logger.info("浏览器入口 → http://%s:%s  （请打开这个地址；0.0.0.0 只是监听地址，浏览器会拒绝）", shown, port)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _wait_for_db()
    # 生产环境必须换掉默认密钥：默认值写在源码里，等于所有人都能签出
    # 任意角色的 JWT（伪造店长令牌 = 全权限）。开发环境只告警，生产直接拒绝启动。
    if settings.jwt_secret in DEFAULT_JWT_SECRETS or len(settings.jwt_secret) < 32:
        if settings.is_production:
            raise RuntimeError(
                "生产环境必须设置 JWT_SECRET（≥ 32 字节的随机字符串），"
                "当前仍是默认值或长度不足，已拒绝启动。"
            )
        logger.warning("JWT_SECRET 仍是默认值或长度不足 32 字节，生产环境请务必替换")
    # 启动即建表（已存在则跳过，不改动既有数据）
    Base.metadata.create_all(engine)
    # 只有确认 staff 表确实为空才灌种子数据。
    # 这里不做 try/except 兜底：曾经用「查询异常即视为空库」的写法，
    # 只要启动瞬间数据库连接抖动一次，就会走 seed() 的 drop_all 把线上数据全删掉。
    with SessionLocal() as db:
        empty = db.query(func.count(Staff.id)).scalar() == 0
    if empty:
        from app.seed import seed
        logger.info("检测到空库，正在写入演示数据…")
        seed()
    _startup_banner()
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
    # demo=False 时前端登录页会隐藏「演示账号一键填入」区块：
    # 演示账号密码写在种子数据与登录页里，生产环境任由它显示等于公开后门。
    return {"status": "ok", "service": "yunlan-pms", "demo": not settings.is_production}


# ---- 业务路由：必须在静态 mount("/") 之前注册，否则会被静态兜底吞掉 ----
for _r in (auth, state, bookings, reception, billing, rooms, housekeeping, settings_router, guests):
    app.include_router(_r.router)


# ---- 前端静态托管（最后兜底）----
# 只托管前端真正需要的白名单路径（index.html / css/ / js/）。
#
# 早期实现是 app.mount("/", StaticFiles(directory=项目根))：本地默认 FRONTEND_DIR
# 就是仓库根，于是 /backend/.env、/backend/hotel_pms.db、/backend/app/*.py
# 全部能被 HTTP 直接下载（实测均为 200）。任何一个能访问到端口的人都能拿到
# JWT_SECRET（可伪造任意角色令牌）和整库数据（客人手机号、密码哈希）。
# 容器里靠 Dockerfile 把前端复制到 /frontend 隔离，但本地开发走的是默认配置，
# 所以必须在代码层收紧成白名单，而不是依赖部署方式。
_FRONT_ALLOWED_DIRS = ("css", "js")

_frontend = Path(settings.frontend_dir)
if not _frontend.is_absolute():
    from app.config import PROJECT_ROOT
    _frontend = (PROJECT_ROOT / settings.frontend_dir).resolve()

if _frontend.exists():
    for _sub in _FRONT_ALLOWED_DIRS:
        _dir = _frontend / _sub
        if _dir.is_dir():
            app.mount(f"/{_sub}", StaticFiles(directory=str(_dir)), name=f"static-{_sub}")

    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def index_page():
        return FileResponse(_frontend / "index.html")


if __name__ == "__main__":
    # 直接运行本文件时的启动入口（等价于 uvicorn app.main:app）。
    # 传 app 对象而非 "app.main:app" 字符串，避免本模块被二次导入产生两个实例。
    # 默认绑 127.0.0.1 而不是 0.0.0.0：本地开发时绑全网卡，同一 Wi-Fi/办公网内
    # 任何人都能访问这个端口；需要局域网调试时用 HOST=0.0.0.0 显式开启。
    import os
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
    )
