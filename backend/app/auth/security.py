"""鉴权与安全：密码哈希、JWT 签发/校验、RBAC 权限矩阵（与前端 auth.js 完全一致）。

权限键示例：
  room.view / bookings.create / reception.checkin / billing.void / settings.manage ...
角色通配：manager 为 '*'。
"""
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Staff

# 角色中文名
ROLE_NAMES = {
    "manager": "店长",
    "front": "前台",
    "housekeeping": "客房部",
    "finance": "财务",
    "admin": "系统管理员",
}

# 权限矩阵（与前端 js/auth.js 的 ROLE_PERMS 保持一致）
ROLE_PERMS = {
    "manager": ["*"],
    "front": [
        "dashboard.view", "rooms.view", "bookings.view", "reception.view", "guests.view",
        "housekeeping.view", "billing.view",
        "bookings.create", "bookings.edit", "bookings.assign", "bookings.cancel",
        "reception.checkin", "reception.checkout",
        "guests.edit",
        "housekeeping.task",
        "billing.charge", "billing.pay",
    ],
    "housekeeping": [
        "rooms.view", "housekeeping.view",
        "housekeeping.task", "housekeeping.maint",
    ],
    "finance": [
        "dashboard.view", "billing.view", "reports.view", "guests.view",
        "billing.charge", "billing.pay", "billing.void",
    ],
    "admin": [
        "dashboard.view", "rooms.view", "bookings.view", "reception.view", "guests.view",
        "housekeeping.view", "billing.view", "reports.view", "settings.view", "settings.manage",
    ],
}

_bearer = HTTPBearer(auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(staff: Staff) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": staff.id,
        "role": staff.role,
        "name": staff.name,
        "account": staff.account,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Staff:
    if not creds or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="未登录或令牌缺失")
    try:
        payload = _decode(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="无效或过期的令牌")
    staff = db.get(Staff, payload.get("sub"))
    if not staff or staff.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="账号不可用")
    return staff


def require_perm(perm: str):
    """依赖工厂：校验当前用户是否拥有某权限，否则返回 403。"""

    def checker(user: Staff = Depends(get_current_user)) -> Staff:
        perms = ROLE_PERMS.get(user.role, [])
        if "*" not in perms and perm not in perms:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail=f"权限不足：需要 {perm}"
            )
        return user

    return checker
