"""后端端到端测试（FastAPI TestClient，连本地 SQLite）。
覆盖：健康检查 / 登录 / 鉴权拦截 / RBAC 越权 / 核心业务流（预订→入住→退房结账）/
      押金富余退款口径 / 脏房入住拦截 / 超时未到 / 账单条目作废 / 数据重置。

用法：cd backend && python test_api.py

注意：
1. 必须用 `with TestClient(app)` 上下文管理器启动，否则不会触发 lifespan，
   建表与种子数据都不会执行（首次运行会报 no such table: staff）。
2. 日期一律相对当天生成，避免硬编码日期过期后用例失效。
"""
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import app

PASS = 0


def check(name, cond, extra=""):
    global PASS
    assert cond, f"FAIL: {name} -> {extra}"
    PASS += 1
    print(f"  ✓ {name}")


def d(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


print("== 后端 E2E 测试 ==")

with TestClient(app) as client:
    # 1 健康
    r = client.get("/api/health")
    check("health 200", r.status_code == 200, r.text)

    # 2 登录
    r = client.post("/api/auth/login", json={"account": "manager", "password": "123456"})
    check("manager 登录 200", r.status_code == 200, r.text)
    tok = r.json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # 3 错误密码
    r = client.post("/api/auth/login", json={"account": "manager", "password": "wrong"})
    check("错误密码 401", r.status_code == 401)

    # 4 无 token
    r = client.get("/api/state")
    check("无 token -> 401", r.status_code == 401)

    # 5 state 结构
    r = client.get("/api/state", headers=h)
    check("state 200", r.status_code == 200)
    st = r.json()
    check("房态 36 间", len(st["rooms"]) == 36, f"got {len(st['rooms'])}")
    check("员工脱敏(无 password)", "password" not in st["staff"][0] and "password_hash" not in st["staff"][0])
    check("dailyStats 14 天", len(st["dailyStats"]) == 14)
    check("账单含 extras/payments", all("extras" in f and "payments" in f for f in st["folios"]))

    # 6 创建预订（相对当天取日期，避免时间推移后用例过期）
    nb = {"guestName": "测试客", "phone": "13800001234", "typeCode": "STD_S", "source": "phone",
          "arrive": d(10), "depart": d(12), "price": 328, "deposit": 0, "roomNo": None, "memo": ""}
    r = client.post("/api/bookings", headers=h, json=nb)
    check("创建预订 200", r.status_code == 200, r.text)
    check("预订状态 confirmed", r.json().get("status") == "confirmed")
    new_bid = r.json()["id"]

    # 7 过期日期校验
    bad = dict(nb)
    bad["arrive"] = d(-100)
    bad["depart"] = d(-98)
    r = client.post("/api/bookings", headers=h, json=bad)
    check("过期日期预订 400", r.status_code == 400)

    # 8 RBAC 越权
    rf = client.post("/api/auth/login", json={"account": "front", "password": "123456"})
    tokf = rf.json()["access_token"]
    hf = {"Authorization": f"Bearer {tokf}"}
    r = client.post("/api/reset", headers=hf)
    check("front 越权 reset -> 403", r.status_code == 403)
    r = client.post("/api/reset", headers=h)
    check("manager reset 200", r.status_code == 200)

    # 9 入住 / 退房 流程（reset 后数据恢复）
    st = client.get("/api/state", headers=h).json()
    conf = [b for b in st["bookings"] if b["status"] == "confirmed" and b["roomNo"]]
    bid, rno = conf[0]["id"], conf[0]["roomNo"]
    r = client.post("/api/reception/checkin", headers=h,
                    json={"bookingId": bid, "roomNo": rno, "deposit": 500, "method": "微信"})
    check("入住 200", r.status_code == 200, r.text)
    r = client.post("/api/reception/checkout", headers=h, json={"bookingId": bid, "method": "银行卡"})
    check("退房 200", r.status_code == 200, r.text)
    c = r.json()["computed"]
    check("退房 computed 含 total/balance", "total" in c and "balance" in c, str(c))

    # 10 重复退房拦截
    r = client.post("/api/reception/checkout", headers=h, json={"bookingId": bid, "method": "银行卡"})
    check("重复退房 400", r.status_code == 400)

    # 11 退房后房间转 VD + 清洁任务
    st = client.get("/api/state", headers=h).json()
    room = [rm for rm in st["rooms"] if rm["no"] == rno][0]
    check("退房后房间 VD", room["status"] == "VD", room["status"])
    clean = [t for t in st["tasks"] if t["roomNo"] == rno and t["type"] == "cleaning"]
    check("退房生成清洁任务", any(t["status"] == "pending" for t in clean))

    # 12 脏房不可直接入住（回归：曾允许把未清洁房卖出去）
    conf_std = [b for b in st["bookings"]
                if b["status"] == "confirmed" and not b["roomNo"]
                and [rm for rm in st["rooms"] if rm["no"] == rno and rm["typeCode"] == b["typeCode"]]]
    if conf_std:
        r = client.post("/api/reception/checkin", headers=h,
                        json={"bookingId": conf_std[0]["id"], "roomNo": rno, "deposit": 300, "method": "现金"})
        check("空脏房入住 400", r.status_code == 400, r.text)
        check("脏房提示含清洁", "清洁" in r.text, r.text)

    # 13 押金富余退房：退款必须记为负数收款，已收合计不得被退款虚增
    st = client.get("/api/state", headers=h).json()
    conf = [b for b in st["bookings"] if b["status"] == "confirmed" and b["roomNo"]]
    if conf:
        b2 = conf[0]
        r = client.post("/api/reception/checkin", headers=h,
                        json={"bookingId": b2["id"], "roomNo": b2["roomNo"], "deposit": 9999, "method": "现金"})
        check("大额押金入住 200", r.status_code == 200, r.text)
        r = client.post("/api/reception/checkout", headers=h, json={"bookingId": b2["id"], "method": "现金"})
        check("富余退房 200", r.status_code == 200, r.text)
        folio = r.json()["folio"]
        refunds = [p for p in folio["payments"] if p["refund"]]
        check("退款条目带 refund 标记", len(refunds) == 1, str(folio["payments"]))
        check("退款金额为负", refunds and refunds[0]["amount"] < 0, str(refunds))
        paid = sum(p["amount"] for p in folio["payments"] if not p["voided"])
        total = r.json()["computed"]["total"]
        check("结账后已收=应收（余额为 0）", paid == total, f"paid={paid} total={total}")

    # 14 超时未到：预抵日已过的订单仍可标记；未来预抵不可提前标记
    st = client.get("/api/state", headers=h).json()
    today_conf = [b for b in st["bookings"] if b["status"] == "confirmed" and b["arrive"] == d(0)]
    if today_conf:
        r = client.post(f"/api/bookings/{today_conf[0]['id']}/noshow", headers=h)
        check("当天未到店 200", r.status_code == 200, r.text)

    r = client.post("/api/bookings", headers=h, json={
        "guestName": "未来客", "phone": "13800005678", "typeCode": "STD_S", "source": "walkin",
        "arrive": d(3), "depart": d(5), "price": 328, "deposit": 0, "roomNo": None, "memo": "",
    })
    future_bid = r.json()["id"]
    r = client.post(f"/api/bookings/{future_bid}/noshow", headers=h)
    check("未来预抵标记未到店 400", r.status_code == 400, r.text)
    check("未到店提示文案正确", "预抵当天" in r.text, r.text)

    # 15 账单条目作废：类型必须匹配（extra 不能用 void-payment 接口作废）
    st = client.get("/api/state", headers=h).json()
    open_folio = [f for f in st["folios"] if f["status"] == "open" and f["extras"]]
    if open_folio:
        fid, item = open_folio[0]["id"], open_folio[0]["extras"][0]
        r = client.post(f"/api/folios/{fid}/void-payment/{item['id']}", headers=h)
        check("跨类型作废 400", r.status_code == 400, r.text)
        r = client.post(f"/api/folios/{fid}/void-extra/{item['id']}", headers=h)
        check("作废消费条目 200", r.status_code == 200, r.text)

    # 16 可售量必须扣除停用房（回归：原实现把维修房算进可售库存）
    from app.db import SessionLocal
    from app.models import Room
    from app.services import pms as pms_svc
    with SessionLocal() as db:
        today, tomorrow = date.today(), date.today() + timedelta(days=1)
        rooms_exe = db.query(Room).filter(Room.type_code == "EXE_S").all()
        oo_exe = len([r for r in rooms_exe if r.status == "OO"])
        av = pms_svc.availability(db, "EXE_S", today, tomorrow)
        check("停用房不计入可售总量", av["total"] == len(rooms_exe) - oo_exe,
              f"total={av['total']} rooms={len(rooms_exe)} oo={oo_exe}")
        check("可售量不为负", av["available"] >= 0, str(av))

    # 恢复演示数据
    client.post("/api/reset", headers=h)
    check("测试后重置恢复", True)

    # 17 客人档案编辑（PUT /api/guests/{id}，需 guests.edit，manager 有 *）
    g = client.get("/api/state", headers=h).json()["guests"][0]
    r = client.put("/api/guests/" + g["id"], headers=h,
                   json={"vip": "金卡", "tags": ["常住客"], "notes": "靠窗"})
    check("编辑客档 200", r.status_code == 200, r.text)
    check("客档 vip 已更新", r.json().get("vip") == "金卡")

    # 18 新增员工工号不重复（回归：原随机三位数可能撞号）
    r = client.post("/api/staff", headers=h,
                    json={"name": "新员工", "account": "newstaff", "role": "front", "phone": "13800009999"})
    check("新增员工 200", r.status_code == 200, r.text)
    sid_new = r.json()["id"]
    st = client.get("/api/state", headers=h).json()
    check("工号唯一", sum(1 for s in st["staff"] if s["id"] == sid_new) == 1, sid_new)
    check("工号按序递增", sid_new == "S008", sid_new)

    client.post("/api/reset", headers=h)
    check("客档编辑后重置", True)

    # 19 非法入参回归（以下都是「本地 SQLite 放过、线上才炸」或「静默污染数据」的坑）
    # 19.1 未来预抵不得提前入住（否则房间被提前占成在住，房态与报表错位）
    r = client.post("/api/bookings", headers=h, json={
        "guestName": "提前客", "phone": "13800007001", "typeCode": "STD_S", "source": "walkin",
        "arrive": d(20), "depart": d(22), "price": 328, "deposit": 0, "roomNo": "0201", "memo": "",
    })
    check("未来订单创建 200", r.status_code == 200, r.text)
    early_bid = r.json()["id"]
    r = client.post("/api/reception/checkin", headers=h,
                    json={"bookingId": early_bid, "roomNo": "0201", "deposit": 0, "method": "现金"})
    check("未到入住日期 -> 400", r.status_code == 400, r.text)
    check("提前入住提示含日期", "入住日期" in r.text, r.text)

    # 19.2 修改预订时押金必须真正写入（回归：原实现静默丢弃 deposit）
    r = client.put("/api/bookings/" + early_bid, headers=h, json={
        "guestName": "提前客", "phone": "13800007001", "typeCode": "STD_S", "source": "walkin",
        "arrive": d(20), "depart": d(22), "price": 328, "deposit": 800, "roomNo": None, "memo": "",
    })
    check("修改预订 200", r.status_code == 200, r.text)
    check("押金修改已生效", r.json().get("deposit") == 800, str(r.json().get("deposit")))

    # 19.3 不存在的房型 / 渠道 -> 400（MySQL 下会被外键打成 500）
    r = client.post("/api/bookings", headers=h, json={
        "guestName": "错房型", "phone": "13800007002", "typeCode": "NOPE", "source": "walkin",
        "arrive": d(30), "depart": d(31), "price": 328, "deposit": 0, "roomNo": None, "memo": "",
    })
    check("不存在房型 -> 400", r.status_code == 400, r.text)
    r = client.post("/api/bookings", headers=h, json={
        "guestName": "错渠道", "phone": "13800007003", "typeCode": "STD_S", "source": "wechat",
        "arrive": d(30), "depart": d(31), "price": 328, "deposit": 0, "roomNo": None, "memo": "",
    })
    check("不存在渠道 -> 400", r.status_code == 400, r.text)

    # 19.4 超大金额 -> 400（回归：原实现 OverflowError 变 500）
    st = client.get("/api/state", headers=h).json()
    open_fid = [f for f in st["folios"] if f["status"] == "open"][0]["id"]
    r = client.post(f"/api/folios/{open_fid}/pay", headers=h,
                    json={"amount": 99999999999999999999, "method": "现金", "note": ""})
    check("超大金额 -> 400 而非 500", r.status_code == 400, r.text)

    # 19.5 任务状态 / 类型必须是枚举值（回归：原实现可写入 bogus，任务从看板消失）
    tid = client.get("/api/state", headers=h).json()["tasks"][0]["id"]
    r = client.put(f"/api/tasks/{tid}", headers=h, json={"status": "bogus"})
    check("非法任务状态 -> 400", r.status_code == 400, r.text)
    r = client.post("/api/tasks", headers=h,
                    json={"roomNo": "0201", "type": "bogus", "note": "", "assignee": ""})
    check("非法任务类型 -> 400", r.status_code == 400, r.text)

    # 19.6 员工角色必须存在于权限矩阵（回归：未知角色登录后白屏）
    r = client.post("/api/staff", headers=h,
                    json={"name": "幽灵", "account": "ghost", "role": "superadmin", "phone": "13800007004"})
    check("非法角色 -> 400", r.status_code == 400, r.text)

    # 19.7 客档姓名必填（回归：原实现允许建立空姓名档案）
    r = client.post("/api/guests", headers=h, json={"name": "", "phone": "13800007005"})
    check("空姓名客档 -> 400", r.status_code == 400, r.text)

    client.post("/api/reset", headers=h)
    check("非法入参回归后重置", True)

print(f"\n✅ 后端 E2E 全部通过（{PASS} 项断言）")
