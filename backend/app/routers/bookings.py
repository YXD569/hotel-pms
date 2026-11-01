"""预订管理：新建 / 修改 / 排房 / 取消 / 标记未到店。"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["bookings"])


class BookingIn(BaseModel):
    guestName: str
    phone: str
    typeCode: str
    source: str = "walkin"
    arrive: date
    depart: date
    price: int
    deposit: int = 0
    roomNo: str | None = None
    memo: str = ""


class RoomNoIn(BaseModel):
    roomNo: str


def _run(fn, db, user=None):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bookings")
def create(b: BookingIn, _: Staff = Depends(require_perm("bookings.create")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.create_booking(db, b.model_dump()), db)


@router.put("/bookings/{bid}")
def update(bid: str, b: BookingIn, _: Staff = Depends(require_perm("bookings.edit")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.update_booking(db, bid, b.model_dump()), db)


@router.post("/bookings/{bid}/assign")
def assign(bid: str, body: RoomNoIn, _: Staff = Depends(require_perm("bookings.assign")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.assign_room(db, bid, body.roomNo), db)


@router.post("/bookings/{bid}/cancel")
def cancel(bid: str, _: Staff = Depends(require_perm("bookings.cancel")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.cancel_booking(db, bid), db)


@router.post("/bookings/{bid}/noshow")
def noshow(bid: str, _: Staff = Depends(require_perm("bookings.cancel")),
           db: Session = Depends(get_db)):
    return _run(lambda: pms.mark_noshow(db, bid), db)
