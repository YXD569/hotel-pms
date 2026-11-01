"""后端端到端测试（FastAPI TestClient，连本地 SQLite）。
覆盖：健康检查 / 登录 / 鉴权拦截 / RBAC 越权 / 核心业务流（预订→入住→退房结账）/ 满房与重复退房校验 / 数据重置。
用法：cd backend && python test_api.py
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PASS = 0


def check(name, cond, extra=""):
    global PASS
    assert cond, f"FAIL: {name} -> {extra}"
    PASS += 1
    print(f"  ✓ {name}")


print("== 后端 E2E 测试 ==")
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

# 6 创建预订
nb = {"guestName": "测试客", "phone": "13800001234", "typeCode": "STD_S", "source": "phone",
      "arrive": "2026-11-10", "depart": "2026-11-12", "price": 328, "deposit": 0, "roomNo": None, "memo": ""}
r = client.post("/api/bookings", headers=h, json=nb)
check("创建预订 200", r.status_code == 200, r.text)
check("预订状态 confirmed", r.json().get("status") == "confirmed")

# 7 过期日期校验
bad = dict(nb)
bad["arrive"] = "2020-01-01"
bad["depart"] = "2020-01-03"
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
r = client.get("/api/state", headers=h)
st = r.json()
conf = [b for b in st["bookings"] if b["status"] == "confirmed" and b["roomNo"]]
bid = conf[0]["id"]
rno = conf[0]["roomNo"]
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
r = client.get("/api/state", headers=h)
st = r.json()
room = [rm for rm in st["rooms"] if rm["no"] == rno][0]
check("退房后房间 VD", room["status"] == "VD", room["status"])
clean = [t for t in st["tasks"] if t["roomNo"] == rno and t["type"] == "cleaning"]
check("退房生成清洁任务", any(t["status"] == "pending" for t in clean))

# 恢复演示数据
client.post("/api/reset", headers=h)
check("测试后重置恢复", True)

# 12 客人档案编辑（PUT /api/guests/{id}，需 guests.edit，manager 有 *）
g = client.get("/api/state", headers=h).json()["guests"][0]
r = client.put("/api/guests/" + g["id"], headers=h,
               json={"vip": "金卡", "tags": ["常住客"], "notes": "靠窗"})
check("编辑客档 200", r.status_code == 200, r.text)
check("客档 vip 已更新", r.json().get("vip") == "金卡")
client.post("/api/reset", headers=h)
check("客档编辑后重置", True)

print(f"\n✅ 后端 E2E 全部通过（{PASS} 项断言）")
