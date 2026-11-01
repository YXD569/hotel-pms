"""Pydantic 模型：仅放跨路由复用的入参/出参；各路由的局部模型就近定义。"""
from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    account: str
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    account: str
    role: str
    phone: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
