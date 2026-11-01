"""PMS 业务逻辑层 —— 移植自前端 js/mock/api.js，改为操作 MySQL。

设计要点：
- 所有函数接收 db: Session，返回与前端 PMS.api 完全一致的 dict 结构（日期统一 ISO 字符串）。
- 纯计算（如账单计算）保持与前端同算法，保证演示数值一致。
- 写操作后由 router 触发前端重新拉取 GET /api/state 刷新，页面层零改动。
"""
import random
import re
import string
from datetime import date, datetime

from app.models import (
    Booking,
    DailyStat,
    Folio,
    FolioItem,
    Guest,
    Room,
    RoomType,
    Staff,
    Task,
)

HOTEL_NAME = "云澜大酒店"

SOURCES = [
    {"key": "walkin", "name": "上门散客"},
    {"key": "phone", "name": "电话预订"},
    {"key": "ctrip", "name": "携程"},
    {"key": "meituan", "name": "美团"},
    {"key": "direct", "name": "官网直销"},
    {"key": "corp", "name": "企业协议"},
]

ROOM_STATUS = {
    "OK": {"label": "空净", "cls": "bg-green"},
    "VD": {"label": "空脏", "cls": "bg-amber"},
    "OC": {"label": "在住", "cls": "bg-blue"},
    "OO": {"label": "停用", "cls": "bg-red"},
}
BK_STATUS = {
    "confirmed": {"label": "待入住", "cls": "bg-blue"},
    "checkedin": {"label": "在住", "cls": "bg-green"},
    "checkedout": {"label": "已离店", "cls": "bg-grey"},
    "cancelled": {"label": "已取消", "cls": "bg-grey"},
    "noshow": {"label": "未到店", "cls": "bg-red"},
}


# ---------- 通用工具 ----------
def _iso(d):
    return d.isoformat() if isinstance(d, date) else str(d)


def _uid(prefix: str, n: int = 6) -> str:
    return prefix + "".join(random.choices(string.digits, k=n))


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def is_phone(v):
    return bool(re.match(r"^1[3-9]\d{9}$", v or ""))


def type_name(db, code):
    t = db.get(RoomType, code)
    return t.name if t else code


# ---------- 序列化 ----------
def _booking_out(b: Booking) -> dict:
    return {
        "id": b.id, "guestName": b.guest_name, "phone": b.phone,
        "typeCode": b.type_code, "source": b.source,
        "arrive": _iso(b.arrive), "depart": _iso(b.depart),
        "nights": b.nights, "price": b.price, "deposit": b.deposit,
        "roomNo": b.room_no, "status": b.status, "memo": b.memo or "",
        "createdAt": _iso(b.created_at),
    }


def _guest_out(g: Guest) -> dict:
    return {
        "id": g.id, "name": g.name, "phone": g.phone,
        "idCardMasked": g.id_card_masked, "vip": g.vip,
        "tags": g.tags or [], "notes": g.notes or "",
        "stays": g.stays, "spend": g.spend, "createdAt": _iso(g.created_at),
    }


def _folio_out(f: Folio, items) -> dict:
    extras, payments = [], []
    for it in items:
        if it.kind == "extra":
            extras.append({
                "id": it.id, "name": it.name, "category": it.category, "qty": it.qty,
                "amount": it.amount, "time": it.time, "voided": it.void,
            })
        else:
            payments.append({
                "id": it.id, "name": it.name, "amount": it.amount, "method": it.method,
                "note": it.note, "time": it.time, "voided": it.void,
                "refund": it.amount < 0,
            })
    return {
        "id": f.id, "bookingId": f.booking_id, "roomNo": f.room_no,
        "guestName": f.guest_name, "deposit": f.deposit,
        "extras": extras, "payments": payments,
        "status": f.status, "settledAt": f.settled_at,
        "settledTotal": f.settled_total, "invoice": f.invoice,
    }


def _task_out(t: Task) -> dict:
    return {
        "id": t.id, "roomNo": t.room_no, "type": t.type, "status": t.status,
        "assignee": t.assignee, "note": t.note or "",
        "createdAt": t.created_at, "doneAt": t.done_at,
    }


def get_state(db) -> dict:
    rooms = db.query(Room).order_by(Room.no).all()
    room_types = db.query(RoomType).all()
    bookings = db.query(Booking).all()
    guests = db.query(Guest).all()
    folios = db.query(Folio).all()
    tasks = db.query(Task).all()
    staff = db.query(Staff).all()
    daily = db.query(DailyStat).order_by(DailyStat.date).all()

    items = db.query(FolioItem).all()
    items_by_folio = {}
    for it in items:
        items_by_folio.setdefault(it.folio_id, []).append(it)

    return {
        "hotelName": HOTEL_NAME,
        "roomTypes": [
            {"code": t.code, "name": t.name, "basePrice": t.base_price,
             "capacity": t.capacity, "size": t.size}
            for t in room_types
        ],
        "rooms": [
            {"no": r.no, "floor": r.floor, "typeCode": r.type_code,
             "status": r.status, "bookingId": r.booking_id, "oooNote": r.ooo_note}
            for r in rooms
        ],
        "bookings": [_booking_out(b) for b in bookings],
        "guests": [_guest_out(g) for g in guests],
        "folios": [_folio_out(f, items_by_folio.get(f.id, [])) for f in folios],
        "tasks": [_task_out(t) for t in tasks],
        "staff": [
            {"id": s.id, "name": s.name, "account": s.account, "role": s.role,
             "phone": s.phone, "status": s.status}
            for s in staff
        ],
        "dailyStats": [
            {"date": _iso(d.date), "occ": d.occ, "roomsSold": d.rooms_sold,
             "adr": d.adr, "revenue": d.revenue, "revpar": d.revpar}
            for d in daily
        ],
        "sources": SOURCES,
        "bkStatus": BK_STATUS,
        "roomStatus": ROOM_STATUS,
    }


# ---------- 房量计算 ----------
def active_bookings(db):
    return db.query(Booking).filter(Booking.status.in_(["confirmed", "checkedin"])).all()


def availability(db, type_code, arrive, depart, exclude_id=None):
    """可售量计算：停用（OO）房不计入可售库存，避免把维修房卖出去。"""
    rooms = db.query(Room).filter(Room.type_code == type_code).all()
    sellable = [r for r in rooms if r.status != "OO"]
    overlap = [
        b for b in active_bookings(db)
        if b.id != exclude_id and b.type_code == type_code
        and b.arrive < depart and arrive < b.depart
    ]
    return {
        "total": len(sellable), "booked": len(overlap),
        "available": max(0, len(sellable) - len(overlap)),
    }


def free_rooms(db, type_code, arrive, depart, exclude_id=None):
    busy = {}
    for b in active_bookings(db):
        if b.id != exclude_id and b.room_no and b.arrive < depart and arrive < b.depart:
            busy[b.room_no] = True
    return [
        r for r in db.query(Room).filter(Room.type_code == type_code).all()
        if r.status != "OO" and r.no not in busy
    ]


# ---------- 预订 ----------
def validate_booking(db, d, exclude_id=None):
    if not (d.get("guestName") or "").strip():
        return "请填写客人姓名"
    if not is_phone(d.get("phone")):
        return "请填写正确的手机号"
    if d["arrive"] < date.today():
        # 修改已有订单时允许保留原入住日期：超时未到的订单仍需可编辑
        keep_original = False
        if exclude_id:
            cur = db.get(Booking, exclude_id)
            keep_original = bool(cur and d["arrive"] == cur.arrive)
        if not keep_original:
            return "入住日期不能早于今天"
    if d["depart"] <= d["arrive"]:
        return "离店日期必须晚于入住日期"
    if not (d.get("price", 0) > 0):
        return "请填写有效的房价"
    av = availability(db, d["typeCode"], d["arrive"], d["depart"], exclude_id)
    if d.get("roomNo"):
        if not any(r.no == d["roomNo"] for r in free_rooms(db, d["typeCode"], d["arrive"], d["depart"], exclude_id)):
            return "所选房间在该日期段不可用"
    elif av["available"] <= 0:
        return type_name(db, d["typeCode"]) + " 在该日期段已满房"
    return None


def create_booking(db, d):
    err = validate_booking(db, d)
    if err:
        raise ValueError(err)
    b = Booking(
        id=_uid("B"), guest_name=d["guestName"].strip(), phone=d["phone"],
        type_code=d["typeCode"], source=d.get("source", "walkin"),
        arrive=d["arrive"], depart=d["depart"],
        nights=(d["depart"] - d["arrive"]).days, price=d["price"],
        deposit=d.get("deposit", 0) or 0, room_no=d.get("roomNo"),
        status="confirmed", memo=d.get("memo", "") or "", created_at=date.today(),
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _booking_out(b)


def update_booking(db, bid, d):
    b = db.get(Booking, bid)
    if not b:
        raise ValueError("订单不存在")
    if b.status != "confirmed":
        raise ValueError("仅待入住的订单可以修改")
    merged = {
        "guestName": d.get("guestName", b.guest_name),
        "phone": d.get("phone", b.phone),
        "typeCode": d.get("typeCode", b.type_code),
        "source": d.get("source", b.source),
        "arrive": d.get("arrive", b.arrive),
        "depart": d.get("depart", b.depart),
        "price": d.get("price", b.price),
        "roomNo": d.get("roomNo", b.room_no),
        "memo": d.get("memo", b.memo) or "",
    }
    err = validate_booking(db, merged, exclude_id=bid)
    if err:
        raise ValueError(err)
    b.guest_name = merged["guestName"]
    b.phone = merged["phone"]
    b.type_code = merged["typeCode"]
    b.source = merged["source"]
    b.arrive = merged["arrive"]
    b.depart = merged["depart"]
    b.price = merged["price"]
    b.room_no = merged["roomNo"]
    b.memo = merged["memo"]
    b.nights = (merged["depart"] - merged["arrive"]).days
    db.commit()
    db.refresh(b)
    return _booking_out(b)


def assign_room(db, bid, room_no):
    b = db.get(Booking, bid)
    if not b or b.status != "confirmed":
        raise ValueError("仅待入住的订单可以排房")
    if not any(r.no == room_no for r in free_rooms(db, b.type_code, b.arrive, b.depart, b.id)):
        raise ValueError("该房间在此日期段不可用")
    b.room_no = room_no
    db.commit()
    db.refresh(b)
    return _booking_out(b)


def cancel_booking(db, bid):
    b = db.get(Booking, bid)
    if not b or b.status != "confirmed":
        raise ValueError("仅待入住的订单可以取消")
    b.status = "cancelled"
    db.commit()
    db.refresh(b)
    return _booking_out(b)


def mark_noshow(db, bid):
    b = db.get(Booking, bid)
    if not b or b.status != "confirmed":
        raise ValueError("仅待入住的订单可标记未到店")
    if b.arrive > date.today():
        raise ValueError("未到店只能在预抵当天或之后标记")
    b.status = "noshow"
    b.room_no = None
    db.commit()
    db.refresh(b)
    return _booking_out(b)


# ---------- 入住 / 退房 ----------
def _ensure_guest(db, name, phone):
    g = db.query(Guest).filter(Guest.phone == phone).first()
    if g:
        g.stays += 1
    else:
        g = Guest(
            id=_uid("G", 4), name=name, phone=phone, id_card_masked="",
            vip="普通", tags=[], notes="", stays=1, spend=0, created_at=date.today(),
        )
        db.add(g)


def check_in(db, bid, room_no, deposit, method):
    b = db.get(Booking, bid)
    if not b or b.status != "confirmed":
        raise ValueError("订单状态不允许办理入住")
    if deposit is None or deposit < 0:
        raise ValueError("押金不能为负数")
    target = room_no or b.room_no
    if not target:
        raise ValueError("请先为该订单选择房间")
    room = db.get(Room, target)
    if not room or room.type_code != b.type_code:
        raise ValueError("房间与房型不匹配")
    if room.status == "OO":
        raise ValueError("该房间已停用，不能安排入住")
    if room.status == "VD":
        raise ValueError("该房间尚未清洁，请先在客房管理中完成清洁任务")
    if not any(r.no == target for r in free_rooms(db, b.type_code, b.arrive, b.depart, b.id)):
        raise ValueError("该房间在此日期段已被占用")

    b.status = "checkedin"
    b.room_no = target
    b.deposit = deposit or 0
    room.status = "OC"
    room.booking_id = b.id

    f = Folio(
        id=_uid("F"), booking_id=b.id, room_no=target, guest_name=b.guest_name,
        deposit=b.deposit, status="open",
    )
    db.add(f)
    if b.deposit > 0:
        db.add(FolioItem(
            folio_id=f.id, kind="payment", name="收款", amount=b.deposit,
            method=method or "现金", note="预收押金", time=_now(),
        ))
    _ensure_guest(db, b.guest_name, b.phone)
    db.commit()
    db.refresh(b)
    return _booking_out(b)


def _folio_computed(folio, booking):
    """账单结账口径：房费按整段房晚计，杂项与收款均跳过作废条目。
    退款以负数收款入账，因此 paid 直接累加即可得到真实已收（不会被退款虚增）。"""
    extras_total = sum(e["amount"] * e.get("qty", 1) for e in folio["extras"] if not e["voided"])
    paid = sum(p["amount"] for p in folio["payments"] if not p["voided"])
    room_fee = booking["nights"] * booking["price"] if booking else 0
    total = room_fee + extras_total
    return {
        "nights": booking["nights"] if booking else 0,
        "roomFee": room_fee,
        "extrasTotal": extras_total, "paid": paid,
        "total": total, "balance": total - paid,
    }


def check_out(db, bid, method):
    b = db.get(Booking, bid)
    if not b or b.status != "checkedin":
        raise ValueError("订单状态不允许办理退房")
    f = db.query(Folio).filter(Folio.booking_id == bid, Folio.status == "open").first()
    if not f:
        raise ValueError("找不到关联账单")

    items = db.query(FolioItem).filter(FolioItem.folio_id == f.id).all()
    folio_view = _folio_out(f, items)
    booking_view = _booking_out(b)
    c = _folio_computed(folio_view, booking_view)

    if c["balance"] > 0:
        db.add(FolioItem(folio_id=f.id, kind="payment", name="收款",
                         amount=c["balance"], method=method or "现金",
                         note="离店补收", time=_now()))
    elif c["balance"] < 0:
        # 押金富余：以负数收款记录退款，保证「已收合计」不被退款金额虚增
        db.add(FolioItem(folio_id=f.id, kind="payment", name="押金退还",
                         amount=c["balance"], method=method or "现金",
                         note="押金退还", time=_now()))
    f.status = "settled"
    f.settled_at = _now()
    f.settled_total = c["total"]

    b.status = "checkedout"
    room = db.get(Room, b.room_no)
    if room:
        room.status = "VD"
        room.booking_id = None
    db.add(Task(
        id=_uid("T"), room_no=b.room_no, type="cleaning", status="pending",
        assignee="", note="退房清洁", created_at=_now(), done_at=None,
    ))
    g = db.query(Guest).filter(Guest.phone == b.phone).first()
    if g:
        g.spend += c["total"]
    db.commit()
    db.refresh(f)
    return {
        "booking": _booking_out(b),
        "folio": _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == f.id).all()),
        "computed": c,
    }


# ---------- 账务 ----------
def add_extra(db, folio_id, item):
    f = db.get(Folio, folio_id)
    if not f or f.status != "open":
        raise ValueError("仅未结账账单可以加项")
    if not (item.get("amount", 0) > 0):
        raise ValueError("请填写有效金额")
    if (item.get("qty") or 1) < 1:
        raise ValueError("数量至少为 1")
    db.add(FolioItem(
        folio_id=folio_id, kind="extra", name=item["name"],
        category=item.get("category"), qty=item.get("qty") or 1,
        amount=item["amount"], time=_now(),
    ))
    db.commit()
    return _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == folio_id).all())


def add_payment(db, folio_id, amount, method, note):
    f = db.get(Folio, folio_id)
    if not f or f.status != "open":
        raise ValueError("仅未结账账单可以收款")
    if not (amount > 0):
        raise ValueError("请填写有效金额")
    db.add(FolioItem(
        folio_id=folio_id, kind="payment", name="收款", amount=amount,
        method=method, note=note or "账房收款", time=_now(),
    ))
    db.commit()
    return _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == folio_id).all())


def _void_item(db, folio_id, item_id, kind):
    """作废账单条目：已结账账单不可再改动，且只能作废对应类型的条目。"""
    f = db.get(Folio, folio_id)
    if not f:
        raise ValueError("账单不存在")
    if f.status != "open":
        raise ValueError("已结账账单不可作废条目")
    it = db.get(FolioItem, item_id)
    if not it or it.folio_id != folio_id or it.kind != kind:
        raise ValueError("账单条目不存在")
    if it.void:
        raise ValueError("该条目已作废")
    it.void = True
    db.commit()
    return _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == folio_id).all())


def void_extra(db, folio_id, item_id):
    return _void_item(db, folio_id, item_id, "extra")


def void_payment(db, folio_id, item_id):
    return _void_item(db, folio_id, item_id, "payment")


def set_invoice(db, folio_id, on):
    f = db.get(Folio, folio_id)
    if not f:
        raise ValueError("账单不存在")
    if f.status != "settled":
        raise ValueError("仅已结账账单可以开票")
    f.invoice = bool(on)
    db.commit()
    return _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == folio_id).all())


# ---------- 客房任务 ----------
def create_task(db, room_no, ttype, note, assignee):
    t = Task(
        id=_uid("T"), room_no=room_no, type=ttype, status="pending",
        assignee=assignee or "", note=note or "", created_at=_now(), done_at=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task_out(t)


def update_task(db, tid, patch):
    t = db.get(Task, tid)
    if not t:
        raise ValueError("任务不存在")
    if patch.get("status"):
        t.status = patch["status"]
        if patch["status"] == "done":
            t.done_at = _now()
            room = db.get(Room, t.room_no)
            if room and t.type == "cleaning" and room.status == "VD":
                room.status = "OK"
    if patch.get("assignee") is not None:
        t.assignee = patch["assignee"]
    if patch.get("note") is not None:
        t.note = patch["note"]
    db.commit()
    db.refresh(t)
    return _task_out(t)


def set_room_oo(db, room_no, note):
    r = db.get(Room, room_no)
    if not r:
        raise ValueError("房间不存在")
    if r.status == "OC":
        raise ValueError("在住房间不能直接停用，请先办理退房")
    today = date.today()
    busy = db.query(Booking).filter(
        Booking.room_no == room_no,
        Booking.status.in_(["confirmed", "checkedin"]),
        Booking.arrive <= today, Booking.depart > today,
    ).first()
    if busy:
        raise ValueError("该房间今日有预抵/在住订单，请先处理订单再停用")
    r.status = "OO"
    r.ooo_note = note or ""
    db.commit()
    db.refresh(r)
    return {"no": r.no, "floor": r.floor, "typeCode": r.type_code,
            "status": r.status, "bookingId": r.booking_id, "oooNote": r.ooo_note}


def restore_room(db, room_no):
    r = db.get(Room, room_no)
    if not r or r.status != "OO":
        raise ValueError("该房间不在停用状态")
    r.status = "VD"
    r.ooo_note = ""
    db.commit()
    db.refresh(r)
    return {"no": r.no, "floor": r.floor, "typeCode": r.type_code,
            "status": r.status, "bookingId": r.booking_id, "oooNote": r.ooo_note}


# ---------- 设置 ----------
def _next_staff_id(db) -> str:
    """按现有 Sxxx 工号递增，避免随机三位数与既有工号碰撞。"""
    nums = []
    for sid, in db.query(Staff.id).all():
        if sid and sid.startswith("S") and sid[1:].isdigit():
            nums.append(int(sid[1:]))
    return f"S{(max(nums) + 1) if nums else 1:03d}"


def upsert_staff(db, s, current_account):
    import bcrypt
    if not (s.get("name") and s.get("account")):
        raise ValueError("姓名与账号必填")
    if s.get("id"):
        old = db.get(Staff, s["id"])
        if not old:
            raise ValueError("员工不存在")
        if db.query(Staff).filter(Staff.account == s["account"], Staff.id != s["id"]).first():
            raise ValueError("账号已存在")
        old.name = s["name"]
        old.account = s["account"]
        old.role = s.get("role", old.role)
        old.phone = s.get("phone", old.phone) or ""
        if s.get("password"):
            old.password_hash = bcrypt.hashpw(s["password"].encode(), bcrypt.gensalt()).decode()
        db.commit()
        db.refresh(old)
        return {"id": old.id, "name": old.name, "account": old.account,
                "role": old.role, "phone": old.phone, "status": old.status}
    else:
        if db.query(Staff).filter(Staff.account == s["account"]).first():
            raise ValueError("账号已存在")
        sid = _next_staff_id(db)
        staff = Staff(
            id=sid, name=s["name"], account=s["account"],
            password_hash=bcrypt.hashpw((s.get("password") or "123456").encode(), bcrypt.gensalt()).decode(),
            role=s.get("role", "front"), phone=s.get("phone", "") or "", status="active",
        )
        db.add(staff)
        db.commit()
        db.refresh(staff)
        return {"id": staff.id, "name": staff.name, "account": staff.account,
                "role": staff.role, "phone": staff.phone, "status": staff.status}


def toggle_staff(db, sid, current_account):
    s = db.get(Staff, sid)
    if not s:
        raise ValueError("员工不存在")
    if s.account == current_account:
        raise ValueError("不能停用当前登录账号")
    s.status = "disabled" if s.status == "active" else "active"
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "account": s.account,
            "role": s.role, "phone": s.phone, "status": s.status}


def update_room_type(db, code, patch):
    t = db.get(RoomType, code)
    if not t:
        raise ValueError("房型不存在")
    if not (patch.get("basePrice", 0) > 0):
        raise ValueError("请填写有效价格")
    t.base_price = patch["basePrice"]
    if patch.get("name"):
        t.name = patch["name"]
    db.commit()
    db.refresh(t)
    return {"code": t.code, "name": t.name, "basePrice": t.base_price,
            "capacity": t.capacity, "size": t.size}


def create_guest(db, d):
    if not is_phone(d.get("phone")):
        raise ValueError("请填写正确的手机号")
    existing = db.query(Guest).filter(Guest.phone == d["phone"]).first()
    if existing:
        raise ValueError("该手机号已存在")
    g = Guest(
        id=_uid("G", 4), name=d.get("name", ""), phone=d["phone"],
        id_card_masked=d.get("idCardMasked", ""), vip=d.get("vip", "普通"),
        tags=d.get("tags", []), notes=d.get("notes", ""), stays=0, spend=0,
        created_at=date.today(),
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return _guest_out(g)


def update_guest(db, gid, d):
    g = db.get(Guest, gid)
    if not g:
        raise ValueError("客人不存在")
    if d.get("vip") is not None:
        g.vip = d["vip"]
    if d.get("tags") is not None:
        g.tags = d["tags"]
    if d.get("notes") is not None:
        g.notes = d["notes"]
    db.commit()
    db.refresh(g)
    return _guest_out(g)
