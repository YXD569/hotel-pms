"""聚合状态快照：登录即可获取全量数据（staff 已脱敏）。前端改写后以此替代本地 localStorage。"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
def get_state(user: Staff = Depends(get_current_user), db: Session = Depends(get_db)):
    # 按登录角色裁剪字段（账单金额 / 客人档案 / 员工手机号），越权数据不下发
    return pms.get_state(db, user.role)
