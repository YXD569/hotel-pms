"""应用配置：从环境变量 / .env 读取，所有可调参数集中此处。"""
import os
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ 目录 与 项目根(hotel-pms/) 目录
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 数据库：Railway 添加 MySQL 插件后会注入 DATABASE_URL / MYSQL_URL，本地开发用下方默认
    database_url: str = "sqlite+pysqlite:///./hotel_pms.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def _resolve_database_url(cls, v):
        # 显式 DATABASE_URL 优先（Railway 旧版插件 / 手动填）
        env_db = os.getenv("DATABASE_URL")
        if env_db:
            return env_db
        # Railway 新版 MySQL 插件注入的是 MYSQL_URL（mysql://...）
        env_mysql = os.getenv("MYSQL_URL")
        if env_mysql:
            return env_mysql
        # 本地默认（SQLite，开箱即用）
        return v or "sqlite+pysqlite:///./hotel_pms.db"

    # JWT
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8  # 8 小时

    # 前端静态目录（默认指向项目根，含 index.html）
    frontend_dir: str = str(PROJECT_ROOT)

    # 允许跨域的来源（开发用 localhost；部署时换成 Railway 域名）
    cors_origins: str = "http://localhost:8000,http://127.0.0.1:8000"

    @property
    def cors_origin_list(self) -> list:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
