"""建表 + 填充演示数据（移植自前端 js/mock/seed.js，保证演示鲜活）。

- 开发期可重复运行：先 drop 再 create 再插入，等价于前端「重置演示数据」。
- 生产部署请勿直接 drop，应改用数据库迁移脚本。
- 账号密码统一为 123456（bcrypt 哈希存储）。

用法：python -m app.seed
"""
import bcrypt
from datetime import date, timedelta

from app.config import DEMO_PASSWORD
from app.db import Base, SessionLocal, engine
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

ROOM_TYPES = [
    {"code": "STD_S", "name": "标准单人间", "base_price": 328, "capacity": 1, "size": 18},
    {"code": "STD_D", "name": "标准双床房", "base_price": 388, "capacity": 2, "size": 24},
    {"code": "SUP_K", "name": "高级大床房", "base_price": 458, "capacity": 2, "size": 28},
    {"code": "EXE_S", "name": "行政套房", "base_price": 788, "capacity": 2, "size": 42},
]

# (id, name, account, role, phone, status)
STAFF = [
    ("S001", "陈云澜", "manager", "manager", "13801000001", "active"),
    ("S002", "苏晓", "front", "front", "13801000002", "active"),
    ("S003", "王秀娟", "housekeeping", "housekeeping", "13801000003", "active"),
    ("S004", "李算", "finance", "finance", "13801000004", "active"),
    ("S005", "系统管理员", "admin", "admin", "13801000005", "active"),
    ("S006", "赵敏", "front2", "front", "13801000006", "active"),
    ("S007", "刘芳", "hk2", "housekeeping", "13801000007", "disabled"),
]

# (name, phone, vip, tags, notes)
GUESTS = [
    ("周慕云", "13912340001", "金卡", ["常住客", "高楼层"], "喜欢安静，优先安排远离电梯的房间。"),
    ("林晚", "13912340002", "普通", [], ""),
    ("沈之航", "13912340003", "银卡", ["延迟退房"], ""),
    ("苏梨", "13912340004", "普通", [], ""),
    ("顾北辰", "13912340005", "钻石", ["企业协议", "常住客"], "星辰科技协议价，发票抬头：星辰科技有限公司。"),
    ("江疏影", "13912340006", "普通", [], ""),
    ("陆则明", "13912340007", "银卡", [], "对枕头有要求，入住时主动提供荞麦枕。"),
    ("许安然", "13912340008", "普通", [], ""),
    ("程一诺", "13912340009", "金卡", ["常住客"], ""),
    ("叶清欢", "13912340010", "普通", [], ""),
    ("段云鹏", "13912340011", "普通", [], ""),
    ("何笑棠", "13912340012", "普通", [], ""),
]

# 层 × (房型:数量)
ROOM_PLAN = [
    {"floor": 2, "STD_S": 4, "STD_D": 6, "SUP_K": 2, "EXE_S": 0},
    {"floor": 3, "STD_S": 0, "STD_D": 4, "SUP_K": 5, "EXE_S": 3},
    {"floor": 4, "STD_S": 0, "STD_D": 0, "SUP_K": 4, "EXE_S": 8},
]


def _d(n: int) -> date:
    return date.today() + timedelta(days=n)


def _price(code: str) -> int:
    return next(t["base_price"] for t in ROOM_TYPES if t["code"] == code)


def _mask(raw: str) -> str:
    return raw[:4] + "********" + raw[-2:] if len(raw) > 7 else raw


def seed():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        # ----- 房型 -----
        for t in ROOM_TYPES:
            db.add(RoomType(**t))

        # ----- 员工（密码统一 123456）-----
        pw_hash = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
        for sid, name, account, role, phone, status in STAFF:
            db.add(Staff(id=sid, name=name, account=account, password_hash=pw_hash,
                         role=role, phone=phone, status=status))

        # ----- 客人档案 -----
        guests = []
        for i, (name, phone, vip, tags, notes) in enumerate(GUESTS):
            raw_id = f"3301{(1980 + i) % 99:02d}{1000 + i * 37}"
            g = Guest(
                id=f"G{101 + i}", name=name, phone=phone,
                id_card_masked=_mask(raw_id), vip=vip, tags=tags, notes=notes,
                stays=0, spend=0, created_at=_d(-(200 + i * 17)),
            )
            guests.append(g)
            db.add(g)
        guest_by_name = {g.name: g for g in guests}

        # ----- 房间 -----
        rooms = []
        for plan in ROOM_PLAN:
            floor = plan["floor"]
            no = 1
            for code in ("STD_S", "STD_D", "SUP_K", "EXE_S"):
                for _ in range(plan[code]):
                    rno = f"0{floor}{'0' + str(no) if no < 10 else no}"
                    rooms.append(Room(no=rno, floor=floor, type_code=code, status="OK"))
                    no += 1
        room_by_no = {}
        for r in rooms:
            db.add(r)
            room_by_no[r.no] = r

        # ----- 预订 / 账务 / 任务 -----
        bk_seq = 2601
        folio_seq = 1
        task_seq = 1

        def add_booking(guest, phone, type_code, source, arrive, depart, price,
                        deposit, room_no, status, memo=""):
            nonlocal bk_seq
            bid = f"B{bk_seq}"
            bk_seq += 1
            nights = (depart - arrive).days
            b = Booking(
                id=bid, guest_name=guest, phone=phone, type_code=type_code,
                source=source, arrive=arrive, depart=depart, nights=nights,
                price=price, deposit=deposit, room_no=room_no, status=status,
                memo=memo, created_at=arrive - timedelta(days=(2 + bk_seq % 5)),
            )
            db.add(b)
            if status == "checkedin" and room_no:
                room = room_by_no.get(room_no)
                if room:
                    room.status = "OC"
                    room.booking_id = bid
            if status in ("checkedin", "checkedout"):
                g = guest_by_name.get(guest)
                if g:
                    g.stays += 1
            return b

        def add_folio(b, extras, payments, status):
            nonlocal folio_seq
            fid = f"F{folio_seq}"
            folio_seq += 1
            f = Folio(id=fid, booking_id=b.id, room_no=b.room_no,
                      guest_name=b.guest_name, deposit=b.deposit, status=status)
            db.add(f)
            for e in extras or []:
                db.add(FolioItem(folio_id=fid, kind="extra", name=e["name"],
                                 category=e.get("category"), qty=e.get("qty", 1),
                                 amount=e["amount"], time=e.get("time")))
            for p in payments or []:
                db.add(FolioItem(folio_id=fid, kind="payment", name="收款",
                                 amount=p["amount"], method=p.get("method"),
                                 note=p.get("note"), time=p.get("time")))
            return f

        def add_task(room_no, ttype, tstatus, assignee, note):
            nonlocal task_seq
            tid = f"T{task_seq}"
            task_seq += 1
            db.add(Task(id=tid, room_no=room_no, type=ttype, status=tstatus,
                        assignee=assignee, note=note or "",
                        created_at=f"{_d(0)} {8 + task_seq % 9}:{10 + (task_seq * 7) % 50:02d}",
                        done_at=None))

        # 在住 5 间
        inhouse = [
            ("周慕云", "13912340001", "SUP_K", "0311", -2, 2, "direct", 1000,
             [{"name": "迷你吧·可乐", "category": "杂项", "qty": 1, "amount": 15, "time": f"{_d(0)} 21:40"}]),
            ("顾北辰", "13912340005", "EXE_S", "0405", -1, 1, "corp", 2000,
             [{"name": "洗衣服务", "category": "杂项", "qty": 2, "amount": 80, "time": f"{_d(0)} 09:15"},
              {"name": "行政酒廊", "category": "餐饮", "qty": 1, "amount": 128, "time": f"{_d(0)} 18:02"}]),
            ("陆则明", "13912340007", "STD_D", "0207", -3, 1, "ctrip", 500, []),
            ("江疏影", "13912340006", "STD_S", "0202", -1, 3, "meituan", 300, []),
            ("程一诺", "13912340009", "SUP_K", "0306", 0, 2, "walkin", 600, []),
        ]
        for guest, phone, tc, rno, a, d, src, dep, extras in inhouse:
            b = add_booking(guest, phone, tc, src, _d(a), _d(d), _price(tc), dep, rno, "checkedin")
            pays = [{"amount": dep, "method": "微信", "time": f"{b.arrive} 14:05", "note": "预收押金"}] if dep > 0 else []
            add_folio(b, extras, pays, "open")

        # 今日预抵 6 单（3 已排房 / 3 未排房）
        arriving = [
            ("沈之航", "13912340003", "STD_D", "0208", 3, "phone", 500),
            ("苏梨", "13912340004", "STD_S", None, 2, "ctrip", 300),
            ("许安然", "13912340008", "SUP_K", "0307", 4, "corp", 800),
            ("叶清欢", "13912340010", "STD_S", None, 1, "walkin", 0),
            ("何笑棠", "13912340012", "STD_D", None, 2, "meituan", 300),
            ("段云鹏", "13912340011", "EXE_S", None, 3, "direct", 1500),
        ]
        for guest, phone, tc, rno, d, src, dep in arriving:
            add_booking(guest, phone, tc, src, _d(0), _d(d), _price(tc), dep, rno, "confirmed")

        # 未来预抵 4 单
        future = [
            ("周慕云", "13912340001", "SUP_K", 3, 5, "direct"),
            ("林晚", "13912340002", "STD_S", 2, 4, "ctrip"),
            ("程一诺", "13912340009", "EXE_S", 5, 7, "corp"),
            ("江疏影", "13912340006", "STD_D", 4, 6, "phone"),
        ]
        for guest, phone, tc, a, d, src in future:
            add_booking(guest, phone, tc, src, _d(a), _d(d), _price(tc), 0, None, "confirmed")

        # 已结清离店 3 单
        checkedout = [
            ("林晚", "13912340002", "STD_S", "0201", -6, -4, "ctrip"),
            ("苏梨", "13912340004", "STD_D", "0205", -5, -3, "walkin"),
            ("沈之航", "13912340003", "SUP_K", "0301", -8, -6, "phone"),
        ]
        for i, (guest, phone, tc, rno, a, d, src) in enumerate(checkedout):
            price = _price(tc)
            b = add_booking(guest, phone, tc, src, _d(a), _d(d), price, 500, rno, "checkedout")
            f = add_folio(b, [], [{"amount": 500, "method": "现金", "time": f"{b.arrive} 14:20", "note": "预收押金"}], "settled")
            f.settled_at = f"{b.depart} 11:3{i}"
            f.settled_total = price * 2
            db.add(FolioItem(folio_id=f.id, kind="payment", name="收款",
                             amount=price * 2 - 500, method="银行卡",
                             time=f.settled_at, note="离店结算"))
            f.invoice = (i == 0)
            g = guest_by_name.get(guest)
            if g:
                g.spend += price * 2

        # 取消 / 未到
        add_booking("叶清欢", "13912340010", "STD_D", "meituan", _d(1), _d(3), _price("STD_D"),
                    0, None, "cancelled", memo="客人行程变更，携程取消。")
        add_booking("许安然", "13912340008", "STD_S", "ctrip", _d(-1), _d(1), _price("STD_S"),
                    0, None, "noshow", memo="过保留房时限未到店。")

        # 空脏房间 + 清洁任务
        for i, no in enumerate(["0203", "0209", "0302", "0308"]):
            room_by_no[no].status = "VD"
            add_task(no, "cleaning", "doing" if i == 0 else "pending",
                     "王秀娟" if i == 0 else "", "客人要求重点清洁卫生间" if i == 3 else "")

        # 历史已完成清洁任务
        add_task("0201", "cleaning", "done", "刘芳", "")
        add_task("0205", "cleaning", "done", "王秀娟", "")

        # 停用维修
        oo = room_by_no["0409"]
        oo.status = "OO"
        oo.ooo_note = "空调主机故障，等待厂商配件，预计 2 天修复。"
        add_task("0409", "maintenance", "doing", "王秀娟", "空调主机故障报修")

        # 近 14 天经营统计
        for i in range(13, -1, -1):
            dd = _d(-i)
            occ = min(68 + ((i * 13 + 5) % 23) + (i < 7 and 4 or 0), 94)
            rooms_sold = round(occ / 100 * 34)
            adr = 415 + ((i * 29) % 60)
            db.add(DailyStat(date=dd, occ=occ, rooms_sold=rooms_sold, adr=adr,
                             revenue=rooms_sold * adr, revpar=round(rooms_sold * adr / 36)))

        db.commit()
        print("✅ 演示数据已写入（房型 %d / 员工 %d / 客人 %d / 房间 %d）" %
              (len(ROOM_TYPES), len(STAFF), len(GUESTS), len(rooms)))


if __name__ == "__main__":
    seed()
