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

from app.auth.security import ROLE_PERMS
from app.config import DEMO_PASSWORD
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

# 单笔金额上限：既要防「填错一个 0」，也要挡住超出 SQLite/MySQL 整型范围的输入
# （超大整数会抛 OverflowError 直接变成 500，而不是可读的 400）。
MAX_MONEY = 9_999_999
MAX_QTY = 99
SOURCE_KEYS = {"walkin", "phone", "ctrip", "meituan", "direct", "corp"}
TASK_TYPES = {"cleaning", "maintenance"}
TASK_STATUS = {"pending", "doing", "done"}
VIP_LEVELS = {"普通", "银卡", "金卡", "钻石"}

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


# ---------- 入参边界校验 ----------
# 统一在服务层边界处校验：前端可绕过、SQLite 不校验 VARCHAR 长度，
# 但部署到 MySQL 严格模式后超长字段会直接报错（500）或静默截断。
def _text(value, label, maxlen, required=False):
    s = "" if value is None else str(value).strip()
    if required and not s:
        raise ValueError("请填写" + label)
    if len(s) > maxlen:
        raise ValueError(f"{label}不能超过 {maxlen} 个字符")
    return s


def _money(value, label, minimum=1, maximum=MAX_MONEY):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError(f"{label}必须是整数")
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label}必须是整数")
    if n != float(value):
        raise ValueError(f"{label}必须是整数")
    if n < minimum or n > maximum:
        raise ValueError(f"{label}需在 {minimum} ~ {maximum} 之间")
    return n


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
def normalize_booking_input(db, d):
    """把预订入参清洗成可写库的规范字典；任一字段不合法即抛 ValueError。

    除了业务校验，还挡掉「房型/渠道不存在」这类会让 MySQL 外键直接报 500 的情况
    （SQLite 默认不校验外键，本地测不出来）。
    """
    arrive, depart = d.get("arrive"), d.get("depart")
    if not isinstance(arrive, date) or not isinstance(depart, date):
        raise ValueError("请填写有效的入住 / 离店日期")

    type_code = _text(d.get("typeCode"), "房型", 16, required=True)
    if not db.get(RoomType, type_code):
        raise ValueError("房型不存在，请重新选择")

    source = _text(d.get("source") or "walkin", "渠道", 16)
    if source not in SOURCE_KEYS:
        raise ValueError("渠道来源不正确")

    room_no = _text(d.get("roomNo"), "房间号", 8) or None

    return {
        "guestName": _text(d.get("guestName"), "客人姓名", 64, required=True),
        "phone": _text(d.get("phone"), "手机号", 32, required=True),
        "typeCode": type_code,
        "source": source,
        "arrive": arrive,
        "depart": depart,
        "price": _money(d.get("price"), "房价", 1),
        "deposit": _money(d.get("deposit") or 0, "押金", 0),
        "roomNo": room_no,
        "memo": _text(d.get("memo"), "备注", 500),
    }


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
    d = normalize_booking_input(db, d)
    err = validate_booking(db, d)
    if err:
        raise ValueError(err)
    b = Booking(
        id=_uid("B"), guest_name=d["guestName"], phone=d["phone"],
        type_code=d["typeCode"], source=d["source"],
        arrive=d["arrive"], depart=d["depart"],
        nights=(d["depart"] - d["arrive"]).days, price=d["price"],
        deposit=d["deposit"], room_no=d["roomNo"],
        status="confirmed", memo=d["memo"], created_at=date.today(),
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
        # 押金也要能改：原实现漏了这一项，表单里改押金保存后会被静默丢弃
        "deposit": d.get("deposit", b.deposit),
        "roomNo": d.get("roomNo", b.room_no),
        "memo": d.get("memo", b.memo),
    }
    merged = normalize_booking_input(db, merged)
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
    b.deposit = merged["deposit"]
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
    # 未来预抵不允许提前入住：否则房间会被提前占成在住，房态与经营数据全部错位
    if b.arrive > date.today():
        raise ValueError("还未到入住日期（" + _iso(b.arrive) + "），不能提前办理入住")
    deposit = _money(0 if deposit is None else deposit, "押金", 0)
    method = _text(method or "现金", "收款方式", 32)
    target = _text(room_no, "房间号", 8) or b.room_no
    if not target:
        raise ValueError("请先为该订单选择房间")
    room = db.get(Room, target)
    if not room or room.type_code != b.type_code:
        raise ValueError("房间与房型不匹配")
    if room.status == "OO":
        raise ValueError("该房间已停用，不能安排入住")
    if room.status == "OC":
        raise ValueError("该房间已有客人在住")
    if room.status == "VD":
        raise ValueError("该房间尚未清洁，请先在客房管理中完成清洁任务")
    if not any(r.no == target for r in free_rooms(db, b.type_code, b.arrive, b.depart, b.id)):
        raise ValueError("该房间在此日期段已被占用")

    b.status = "checkedin"
    b.room_no = target
    b.deposit = deposit
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
            method=method, note="预收押金", time=_now(),
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
    method = _text(method or "现金", "收款方式", 32)
    f = db.query(Folio).filter(Folio.booking_id == bid, Folio.status == "open").first()
    if not f:
        raise ValueError("找不到关联账单")

    items = db.query(FolioItem).filter(FolioItem.folio_id == f.id).all()
    folio_view = _folio_out(f, items)
    booking_view = _booking_out(b)
    c = _folio_computed(folio_view, booking_view)

    if c["balance"] > 0:
        db.add(FolioItem(folio_id=f.id, kind="payment", name="收款",
                         amount=c["balance"], method=method,
                         note="离店补收", time=_now()))
    elif c["balance"] < 0:
        # 押金富余：以负数收款记录退款，保证「已收合计」不被退款金额虚增
        db.add(FolioItem(folio_id=f.id, kind="payment", name="押金退还",
                         amount=c["balance"], method=method,
                         note="押金退还", time=_now()))

    # 补收 / 退款条目落库后重新汇总，保证返回的 computed 是「结算后」口径
    # （否则调用方读到的 paid 还是付款前的值，余额看起来没平）
    db.flush()
    items = db.query(FolioItem).filter(FolioItem.folio_id == f.id).all()
    c = _folio_computed(_folio_out(f, items), booking_view)

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
    name = _text(item.get("name"), "项目名称", 128, required=True)
    category = _text(item.get("category"), "类别", 32)
    amount = _money(item.get("amount"), "金额", 1)
    qty = _money(item.get("qty") or 1, "数量", 1, MAX_QTY)
    db.add(FolioItem(
        folio_id=folio_id, kind="extra", name=name,
        category=category, qty=qty, amount=amount, time=_now(),
    ))
    db.commit()
    return _folio_out(f, db.query(FolioItem).filter(FolioItem.folio_id == folio_id).all())


def add_payment(db, folio_id, amount, method, note):
    f = db.get(Folio, folio_id)
    if not f or f.status != "open":
        raise ValueError("仅未结账账单可以收款")
    amount = _money(amount, "收款金额", 1)
    method = _text(method or "现金", "收款方式", 32)
    note = _text(note or "账房收款", "备注", 500)
    db.add(FolioItem(
        folio_id=folio_id, kind="payment", name="收款", amount=amount,
        method=method, note=note, time=_now(),
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
    room_no = _text(room_no, "房间号", 8, required=True)
    if not db.get(Room, room_no):
        raise ValueError("房间不存在")
    if ttype not in TASK_TYPES:
        raise ValueError("任务类型不正确（只能是 cleaning / maintenance）")
    t = Task(
        id=_uid("T"), room_no=room_no, type=ttype, status="pending",
        assignee=_text(assignee, "分派对象", 64), note=_text(note, "备注", 500),
        created_at=_now(), done_at=None,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task_out(t)


def update_task(db, tid, patch):
    t = db.get(Task, tid)
    if not t:
        raise ValueError("任务不存在")
    if patch.get("status") is not None:
        status = patch["status"]
        if status not in TASK_STATUS:
            raise ValueError("任务状态不正确（只能是 pending / doing / done）")
        t.status = status
        if status == "done":
            t.done_at = _now()
            room = db.get(Room, t.room_no)
            if room and t.type == "cleaning" and room.status == "VD":
                room.status = "OK"
    if patch.get("assignee") is not None:
        t.assignee = _text(patch["assignee"], "分派对象", 64)
    if patch.get("note") is not None:
        t.note = _text(patch["note"], "备注", 500)
    db.commit()
    db.refresh(t)
    return _task_out(t)


def set_room_oo(db, room_no, note):
    r = db.get(Room, room_no)
    if not r:
        raise ValueError("房间不存在")
    if r.status == "OC":
        raise ValueError("在住房间不能直接停用，请先办理退房")
    note = _text(note, "停用原因", 500)
    if not note:
        raise ValueError("请填写停用原因")
    today = date.today()
    busy = db.query(Booking).filter(
        Booking.room_no == room_no,
        Booking.status.in_(["confirmed", "checkedin"]),
        Booking.arrive <= today, Booking.depart > today,
    ).first()
    if busy:
        raise ValueError("该房间今日有预抵/在住订单，请先处理订单再停用")
    r.status = "OO"
    r.ooo_note = note
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


def _staff_password(raw) -> str:
    """员工密码策略：6~64 字节（bcrypt 只取前 72 字节，超长会被静默截断）。"""
    pwd = _text(raw, "密码", 64, required=True)
    if len(pwd.encode("utf-8")) < 6:
        raise ValueError("密码至少 6 位")
    return pwd


def upsert_staff(db, s, current_account):
    import bcrypt
    name = _text(s.get("name"), "姓名", 64, required=True)
    account = _text(s.get("account"), "账号", 64, required=True)
    role = _text(s.get("role") or "front", "角色", 32, required=True)
    # 角色必须落在权限矩阵里：写入未知角色后，该账号登录会拿不到任何页面
    # （前端 ROLE_PERMS 查不到 → 无菜单；ROLES 查不到 → 直接抛异常白屏）
    if role not in ROLE_PERMS:
        raise ValueError("角色不存在")
    phone = _text(s.get("phone"), "手机号", 32)
    if phone and not is_phone(phone):
        raise ValueError("请填写正确的手机号")

    if s.get("id"):
        old = db.get(Staff, s["id"])
        if not old:
            raise ValueError("员工不存在")
        if db.query(Staff).filter(Staff.account == account, Staff.id != s["id"]).first():
            raise ValueError("账号已存在")
        old.name = name
        old.account = account
        old.role = role
        old.phone = phone
        if s.get("password"):
            old.password_hash = bcrypt.hashpw(_staff_password(s["password"]).encode(), bcrypt.gensalt()).decode()
        db.commit()
        db.refresh(old)
        return {"id": old.id, "name": old.name, "account": old.account,
                "role": old.role, "phone": old.phone, "status": old.status}
    else:
        if db.query(Staff).filter(Staff.account == account).first():
            raise ValueError("账号已存在")
        sid = _next_staff_id(db)
        raw_pwd = _staff_password(s["password"]) if s.get("password") else DEMO_PASSWORD
        staff = Staff(
            id=sid, name=name, account=account,
            password_hash=bcrypt.hashpw(raw_pwd.encode(), bcrypt.gensalt()).decode(),
            role=role, phone=phone, status="active",
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
    base_price = _money(patch.get("basePrice"), "门市价", 1, 999_999)
    t.base_price = base_price
    name = _text(patch.get("name"), "房型名称", 64)
    if name:
        t.name = name
    db.commit()
    db.refresh(t)
    return {"code": t.code, "name": t.name, "basePrice": t.base_price,
            "capacity": t.capacity, "size": t.size}


def _guest_tags(tags):
    if tags is None:
        return None
    if not isinstance(tags, list):
        raise ValueError("标签必须是数组")
    out = []
    for tag in tags:
        item = _text(tag, "标签", 16)
        if item and item not in out:
            out.append(item)
    if len(out) > 8:
        raise ValueError("标签最多 8 个")
    return out


def create_guest(db, d):
    name = _text(d.get("name"), "客人姓名", 64, required=True)
    phone = _text(d.get("phone"), "手机号", 32, required=True)
    if not is_phone(phone):
        raise ValueError("请填写正确的手机号")
    existing = db.query(Guest).filter(Guest.phone == phone).first()
    if existing:
        raise ValueError("该手机号已存在")
    vip = _text(d.get("vip") or "普通", "会员等级", 16)
    if vip not in VIP_LEVELS:
        raise ValueError("会员等级不存在")
    g = Guest(
        id=_uid("G", 4), name=name, phone=phone,
        id_card_masked=_text(d.get("idCardMasked"), "证件号", 32),
        vip=vip, tags=_guest_tags(d.get("tags")) or [],
        notes=_text(d.get("notes"), "备注", 500), stays=0, spend=0,
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
        vip = _text(d["vip"], "会员等级", 16)
        if vip not in VIP_LEVELS:
            raise ValueError("会员等级不存在")
        g.vip = vip
    if d.get("tags") is not None:
        g.tags = _guest_tags(d["tags"])
    if d.get("notes") is not None:
        g.notes = _text(d["notes"], "备注", 500)
    db.commit()
    db.refresh(g)
    return _guest_out(g)
