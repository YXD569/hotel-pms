"""客人档案：手动新建客档（入住时也会自动建档）。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["guests"])


class GuestIn(BaseModel):
    name: str = ""
    phone: str
    idCardMasked: str = ""
    vip: str = "普通"
    tags: list = []
    notes: str = ""


class GuestPatch(BaseModel):
    vip: str | None = None
    tags: list | None = None
    notes: str | None = None


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/guests")
def create_guest(body: GuestIn, _: Staff = Depends(require_perm("guests.edit")),
                db: Session = Depends(get_db)):
    return _run(lambda: pms.create_guest(db, body.model_dump()))


@router.put("/guests/{gid}")
def update_guest(gid: str, body: GuestPatch, _: Staff = Depends(require_perm("guests.edit")),
                 db: Session = Depends(get_db)):
    return _run(lambda: pms.update_guest(db, gid, body.model_dump(exclude_unset=True)))
