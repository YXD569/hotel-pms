"""房态写操作：停用（报修）/ 恢复。读取通过 GET /api/state 的 rooms 字段。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["rooms"])


class OOIn(BaseModel):
    note: str = ""


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/rooms/{no}/oo")
def set_oo(no: str, body: OOIn, _: Staff = Depends(require_perm("housekeeping.maint")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.set_room_oo(db, no, body.note))


@router.post("/rooms/{no}/restore")
def restore(no: str, _: Staff = Depends(require_perm("housekeeping.maint")),
            db: Session = Depends(get_db)):
    return _run(lambda: pms.restore_room(db, no))
