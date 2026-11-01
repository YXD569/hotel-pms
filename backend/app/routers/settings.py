"""系统设置：员工增删改停用 / 房型价格 / 重置演示数据。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["settings"])


class StaffIn(BaseModel):
    id: str | None = None
    name: str
    account: str
    role: str
    phone: str = ""
    password: str | None = None


class RoomTypePatch(BaseModel):
    basePrice: int
    name: str | None = None


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/staff")
def upsert(s: StaffIn, user: Staff = Depends(require_perm("settings.manage")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.upsert_staff(db, s.model_dump(), user.account))


@router.post("/staff/{sid}/toggle")
def toggle(sid: str, user: Staff = Depends(require_perm("settings.manage")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.toggle_staff(db, sid, user.account))


@router.put("/room-types/{code}")
def update_room_type(code: str, patch: RoomTypePatch,
                     _: Staff = Depends(require_perm("settings.manage")),
                     db: Session = Depends(get_db)):
    return _run(lambda: pms.update_room_type(db, code, patch.model_dump()))


@router.post("/reset")
def reset(_: Staff = Depends(require_perm("settings.manage")),
          db: Session = Depends(get_db)):
    # 重置演示数据（drop + create + 种子），等价于前端「重置数据」
    from app.seed import seed
    seed()
    return {"ok": True, "message": "演示数据已重置"}
