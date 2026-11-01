"""数据库引擎与会话（同步 SQLAlchemy 2.0 + pymysql）。
单店 PMS 并发低，同步会话配合 FastAPI 线程池足够稳定，且对 Python 3.13 兼容性最好。
"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import BASE_DIR, settings

_SQLITE_PREFIXES = ("sqlite+pysqlite:///", "sqlite:///")


def _anchor_sqlite(url: str) -> str:
    """把相对路径的 SQLite 库锚定到 backend/。

    不锚定的话，库文件相对「当前工作目录」解析：从仓库根执行 `python app/main.py`
    与在 backend/ 下执行 `uvicorn app.main:app` 会各自建一个 hotel_pms.db，
    出现「同一项目两套数据、登录进去数据不见了」的错觉。
    """
    for prefix in _SQLITE_PREFIXES:
        if url.startswith(prefix):
            raw = url[len(prefix):]
            if not raw or raw == ":memory:" or raw.startswith("file:"):
                return url
            path = Path(raw)
            if not path.is_absolute():
                path = (BASE_DIR / path).resolve()
            return prefix + path.as_posix()
    return url


def _normalize_url(url: str) -> str:
    """Railway 注入的 DATABASE_URL 常以 mysql:// 开头，SQLAlchemy 需要 mysql+pymysql://。"""
    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]
    return _anchor_sqlite(url)


_db_url = _normalize_url(settings.database_url)
# SQLite 本地联调需关闭单线程校验，避免线程池下报 checkpoint_thread 错误
_connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}

engine = create_engine(
    _db_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    future=True,
    connect_args=_connect_args,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
