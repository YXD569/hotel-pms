"""聚合状态快照：登录即可获取全量数据（staff 已脱敏）。前端改写后以此替代本地 localStorage。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
def get_state(_: Staff = Depends(get_current_user), db: Session = Depends(get_db)):
    return pms.get_state(db)
