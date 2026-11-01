"""数据库引擎与会话（同步 SQLAlchemy 2.0 + pymysql）。
单店 PMS 并发低，同步会话配合 FastAPI 线程池足够稳定，且对 Python 3.13 兼容性最好。
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


def _normalize_url(url: str) -> str:
    """Railway 注入的 DATABASE_URL 常以 mysql:// 开头，SQLAlchemy 需要 mysql+pymysql://。"""
    if url.startswith("mysql://"):
        return "mysql+pymysql://" + url[len("mysql://"):]
    return url


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
