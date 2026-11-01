"""客房管理：新建 / 更新清洁、维修任务。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["housekeeping"])


class TaskIn(BaseModel):
    roomNo: str
    type: str            # cleaning / maintenance
    note: str = ""
    assignee: str = ""


class TaskPatch(BaseModel):
    status: str | None = None
    assignee: str | None = None
    note: str | None = None


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks")
def create_task(body: TaskIn, _: Staff = Depends(require_perm("housekeeping.task")),
               db: Session = Depends(get_db)):
    return _run(lambda: pms.create_task(db, body.roomNo, body.type, body.note, body.assignee))


@router.put("/tasks/{tid}")
def update_task(tid: str, patch: TaskPatch, _: Staff = Depends(require_perm("housekeeping.task")),
               db: Session = Depends(get_db)):
    return _run(lambda: pms.update_task(db, tid, patch.model_dump(exclude_unset=True)))
