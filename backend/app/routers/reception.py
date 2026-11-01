"""前台接待：办理入住 / 退房结账。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["reception"])


class CheckInIn(BaseModel):
    bookingId: str
    roomNo: str | None = None
    deposit: int = 0
    method: str = "现金"


class CheckOutIn(BaseModel):
    bookingId: str
    method: str = "现金"


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reception/checkin")
def check_in(body: CheckInIn, _: Staff = Depends(require_perm("reception.checkin")),
             db: Session = Depends(get_db)):
    return _run(lambda: pms.check_in(db, body.bookingId, body.roomNo, body.deposit, body.method))


@router.post("/reception/checkout")
def check_out(body: CheckOutIn, _: Staff = Depends(require_perm("reception.checkout")),
              db: Session = Depends(get_db)):
    return _run(lambda: pms.check_out(db, body.bookingId, body.method))
