"""认证路由：登录签发 JWT、获取当前用户。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth.security import create_token, get_current_user, verify_password
from app.db import get_db
from app.models import Staff
from app.schemas import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    staff = db.query(Staff).filter(Staff.account == req.account).first()
    if not staff or not verify_password(req.password, staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误"
        )
    if staff.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="账号已停用"
        )
    token = create_token(staff)
    user = UserOut(
        id=staff.id, name=staff.name, account=staff.account,
        role=staff.role, phone=staff.phone,
    )
    return TokenResponse(access_token=token, user=user)


@router.get("/auth/me", response_model=UserOut)
def me(user: Staff = Depends(get_current_user)):
    return UserOut(
        id=user.id, name=user.name, account=user.account,
        role=user.role, phone=user.phone,
    )
