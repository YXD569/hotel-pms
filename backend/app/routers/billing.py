"""账务中心：加项 / 收款 / 作废条目 / 开票。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.security import get_current_user, require_perm
from app.db import get_db
from app.models import Staff
from app.services import pms

router = APIRouter(prefix="/api", tags=["billing"])


class ExtraIn(BaseModel):
    name: str
    category: str | None = None
    qty: int = 1
    amount: int


class PayIn(BaseModel):
    amount: int
    method: str = "现金"
    note: str = ""


class InvoiceIn(BaseModel):
    invoice: bool


def _run(fn):
    try:
        return fn()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/folios/{fid}/extra")
def add_extra(fid: str, item: ExtraIn, _: Staff = Depends(require_perm("billing.charge")),
              db: Session = Depends(get_db)):
    return _run(lambda: pms.add_extra(db, fid, item.model_dump()))


@router.post("/folios/{fid}/pay")
def add_payment(fid: str, p: PayIn, _: Staff = Depends(require_perm("billing.pay")),
               db: Session = Depends(get_db)):
    return _run(lambda: pms.add_payment(db, fid, p.amount, p.method, p.note))


@router.post("/folios/{fid}/void-extra/{item_id}")
def void_extra(fid: str, item_id: int, _: Staff = Depends(require_perm("billing.void")),
               db: Session = Depends(get_db)):
    return _run(lambda: pms.void_extra(db, fid, item_id))


@router.post("/folios/{fid}/void-payment/{item_id}")
def void_payment(fid: str, item_id: int, _: Staff = Depends(require_perm("billing.void")),
                 db: Session = Depends(get_db)):
    return _run(lambda: pms.void_payment(db, fid, item_id))


@router.post("/folios/{fid}/invoice")
def set_invoice(fid: str, body: InvoiceIn, _: Staff = Depends(require_perm("billing.void")),
                db: Session = Depends(get_db)):
    return _run(lambda: pms.set_invoice(db, fid, body.invoice))
