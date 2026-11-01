# 云澜 PMS · 酒店管理系统

面向酒店内部员工的单店 PMS（Property Management System）。**原生 HTML/CSS/JS 前端 + FastAPI 后端的全栈项目**（本地默认 SQLite，零配置开箱即用；部署可一键切 MySQL）：后端以聚合状态快照 `GET /api/state` 驱动前端 9 个业务页面（页面层基本零改动对接真实数据库），JWT 鉴权 + RBAC 服务端校验；并以**单镜像同时托管前端静态资源**，部署后单 URL 即可使用。

## 系统截图
1.店长
![alt text](6f0cebb0734b6d40f88ada0dc6587536.png)
![alt text](5026f65604a2b0d364353bee96c4540b.png)
2.前台
![alt text](e91fd16f32c47679ca27c15bbe6ab70d.png)
3.客房部
![alt text](dc8f5ad7d7f603585fa7309fcae932bd.png)
4.财务部
![alt text](774e548097739e18260c7a67696b3af9.png)
5.系统管理员
![alt text](493c1bbf50df3fd4b7fe9d223b012586.png)
![alt text](7a9d51c224f01fc61e01314b27cadc54.png)

## 演示账号（密码均为 `123456`，已 bcrypt 哈希存储）

| 账号 | 姓名 | 角色 | 可见模块 |
|---|---|---|---|
| `manager` | 店长 | 全部模块 + 全部操作 |
| `front` | 前台 | 总览/房态/预订/接待/客档/客房/账务（可收款，不可作废） |
| `housekeeping` | 客房部 | 房态看板、客房管理（清洁/维修任务） |
| `finance` | 财务 | 总览/账务/报表/客档（可作废账目、开票） |
| `admin` | 系统管理员 | 系统设置 + 全局只读 |

## 核心功能模块

| 模块 | 功能 |
|---|---|
| 经营总览 | 出租率/预抵/离店/营收统计卡、今日预抵待办、房态速览、预警提醒、14 天出租率趋势 |
| 房态看板 | 按楼层的房态芯片矩阵（空净/空脏/在住/预抵/停用）、7 日房态条带、房间详情抽屉、快捷入住/退房/停用 |
| 预订管理 | 筛选搜索、新建/修改预订（含满房与日期校验、自动报价）、排房、取消、详情 |
| 前台接待 | 今日预抵（含超时未到红色预警）、办理入住（选房/押金/支付方式）、在住名单、退房结账（账单明细、多退少补、自动派清洁任务） |
| 客人档案 | 客人列表、会员等级/标签/偏好备注、住宿历史、自动建档 |
| 客房管理 | 清洁/维修任务三列看板（待处理/进行中/已完成）、任务分派、完成清洁自动恢复可售 |
| 账务中心 | 账单列表与明细、杂项入账（常用项目快捷）、收款、作废（财务权限）、发票标记 |
| 经营报表 | 出租率趋势折线、营收柱状图（手写 SVG）、渠道构成、房型出租分析、ADR/RevPAR |
| 系统设置 | 员工增删改停用、角色分配、房型价格调整、数据导出 JSON、一键重置演示数据 |

## 技术架构

```
hotel-pms/
├── index.html                入口（原生前端，哈希路由，相对 /api 调用后端）
├── css/                      tokens / base / components
├── js/
│   ├── utils.js              DOM/日期/金额/校验工具
│   ├── auth.js               会话 + RBAC 权限矩阵（5 角色 × 页面/动作双层，与后端一致）
│   ├── api-client.js         HTTP API 客户端（对接后端，含本地派生计算缓存）
│   ├── components.js         模态/抽屉/确认框/Toast/表格组件
│   ├── router.js             哈希路由 + 登录守卫 + 权限守卫
│   ├── pages/                9 个业务页面（login/dashboard/rooms/…）
│   └── main.js               启动引导（restore 会话 → init 拉取 state → 注册页面/路由）
├── backend/                  FastAPI 后端（Python 3.11+）
│   ├── app/
│   │   ├── main.py           入口：挂载 /api 路由 + 托管前端静态 + lifespan 启动建表/种子
│   │   ├── db.py             引擎/会话（mysql+pymysql / SQLite），Railway DATABASE_URL 兼容
│   │   ├── config.py         环境变量配置（DATABASE_URL / JWT_SECRET / CORS …）
│   │   ├── models.py         9 张表 ORM 模型
│   │   ├── auth/security.py  密码哈希(bcrypt) + JWT 签发校验 + RBAC 矩阵（与前端一致）
│   │   ├── services/pms.py    业务逻辑层（房量/预订/入住退房/账务/客房/设置）
│   │   ├── routers/          auth / state / bookings / reception / billing / rooms / housekeeping / settings / guests
│   │   └── seed.py          演示数据种子（36 间房 / 4 房型 / 员工 / 客人 / 预订 / 账务 / 任务 / 14 天趋势）
│   ├── requirements.txt      fastapi / uvicorn / sqlalchemy / pymysql / pyjwt / bcrypt …
│   ├── .env.example          环境变量示例（.env 已被忽略，不进仓库）
│   └── test_api.py           后端 E2E 测试（70 条断言，FastAPI TestClient，可空库直接运行）
├── .vscode/                  VS Code 一键运行配置
│   ├── launch.json           F5：启动后端（可断点）/ 跑后端测试
│   ├── tasks.json            Ctrl+Shift+B 热重载启动；环境初始化 / 跑测试任务
│   ├── settings.json         固定解释器 + python.analysis.extraPaths（from app.* 不标红）
│   └── extensions.json       推荐安装 Python 扩展
├── Dockerfile / railway.toml / .dockerignore   一键部署到 Railway（单镜像托管前后端）
├── e2e-test.js               前端 API 冒烟测试（Node，对“运行中的实例”做 HTTP 级校验）
├── client-test.mjs           前端数据层单测（14 项，Node，无需后端，校验请求 URL 与错误文案）
├── main-guard-test.mjs       启动自检单测（7 项，验证 file:// / 0.0.0.0 被拦、正常地址放行）
├── front-tests.mjs           上面两个前端测试的串行入口（跨 PowerShell / Git Bash 都能跑）
└── README.md
```

> 前端对接机制：`js/api-client.js` 的对外签名与原 Mock API 完全一致，`getState()` 仍同步返回内存缓存（页面照旧同步读取）；所有写操作改为异步调用真实 REST 接口，成功后再 `refresh()` 拉取 `GET /api/state` 刷新缓存，页面重渲染即见新数据。

#### 在 VS Code 里跑测试

| 想跑什么 | 操作 |
|---|---|
| **后端 70 条断言**（空库可直接跑） | `Ctrl+Shift+P` → `Tasks: Run Task` → 「跑后端测试」；或 F5 选「后端测试 test_api.py」 |
| **前端 API 冒烟（16 项，需服务已启动）** | `Tasks: Run Task` → 「跑前端 API 冒烟测试」（默认打 `http://127.0.0.1:8000`，需本机装有 Node 18+） |
| **前端数据层单测（22 项，不起服务也行）** | `Tasks: Run Task` → 「跑前端数据层单测」（数据层 15 项 + 启动自检 7 项） |

### B. 命令行启动（后端会一并托管前端）

**Windows · PowerShell（VS Code 默认终端）**

```powershell
cd C:\Users\叶晓栋\Desktop\hotel-pms\backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env -ErrorAction SilentlyContinue
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Windows · cmd**

```bat
cd C:\Users\叶晓栋\Desktop\hotel-pms\backend
py -3.13 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**macOS / Linux**

```bash
cd hotel-pms/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

打开浏览器访问 `http://localhost:8000` 即可（后端同时托管 `index.html` 与 `css/`、`js/`，**无需再开静态服务器 / Live Server**）。
首次启动会自动 `CREATE TABLE` 并在数据库为空时灌入演示数据。

> 若本地有 MySQL：把 `.env` 的 `DATABASE_URL` 改为 `mysql+pymysql://user:pass@localhost:3306/hotel_pms?charset=utf8mb4` 即可（表结构与 SQLite 一致，首次启动自动建表）。

## 部署到 Railway（全栈单镜像）

1. 把仓库推到 GitHub（已包含 `Dockerfile` / `railway.toml`）。
2. Railway 新建 Project → 选择 GitHub 仓库 → 部署。Railway 会按仓库根的 `Dockerfile` 构建：
   - 后端代码放 `/app/app`（使 `import app.main` 成立），前端静态放 `/frontend`（与后端源码隔离，避免通过静态服务暴露后端代码），监听 `$PORT`。
3. 在 Railway 给项目添加 **MySQL 插件**（Plugins → MySQL）。它会自动注入数据库连接串：
   - 新版 MySQL 插件注入 `MYSQL_URL`（`mysql://…`）；旧版/手动填 `DATABASE_URL`。后端已内置二者兼容，并把 `mysql://` 自动转换为 `mysql+pymysql://`，**无需手填**。
4. 设置环境变量（Variables）：
   - `JWT_SECRET`：随机长字符串（≥ 32 字节），生产务必替换默认值。其余变量可留默认。
5. 部署完成后，Railway 分配的域名即为系统入口（前端 + 后端同源，无需配置 CORS）。
   - 首次启动自动建表 + 灌演示数据；之后数据持久化在 MySQL 插件中。
   - 健康检查：`GET /api/health`。

## 环境变量

| 变量 | 说明 | 默认值 / 备注 |
|---|---|---|
| `DATABASE_URL` | 数据库连接串；Railway 旧版 / 手动填 | 本地默认 SQLite；`mysql://` 会被转成 `mysql+pymysql://` |
| `MYSQL_URL` | Railway 新版 MySQL 插件注入，自动使用 | 无需手填 |
| `JWT_SECRET` | HS256 签名密钥（≥ 32 字节） | 生产**必须**覆盖：仍是默认值或不足 32 字节时，生产环境直接拒绝启动 |
| `JWT_ALGORITHM` | JWT 算法 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token 有效期（分钟） | `480`（8 小时） |
| `FRONTEND_DIR` | 前端静态目录（容器内路径） | Docker 内为 `/frontend`；仅托管 `index.html` + `css/` + `js/` 白名单，不暴露同目录其他文件 |
| `CORS_ORIGINS` | 跨域来源（同源部署可留默认） | 本地 `localhost` 调试用 |
| `PORT` | 监听端口（Railway 自动注入） | `8000` |
| `HOST` | 监听地址（仅 `python app/main.py` 直接启动时生效） | `127.0.0.1`；需局域网访问时显式设 `0.0.0.0` |
| `ENV` | 运行环境 `development` / `production` | 留空按 Railway / Render / Fly 标记自动判断；`production` 下启用密钥强校验并隐藏演示账号 |

## 关键业务规则（改动前请先确认）

| 规则 | 说明 |
|---|---|
| 可售库存 | 房量按「房型房间数 − 停用（OO）房 − 该日期段已占用」计算，前端弹窗与后端校验同口径 |
| 空脏房 | `VD` 房不可直接办理入住，必须先完成清洁任务（前端候选列表已过滤，后端二次拦截） |
| 在住房 | `OC` 房不可再被入住（防止脏数据把两位客人安排进同一间） |
| 提前入住 | 预抵日期在未来的订单**不能**办理入住（否则房间被提前占成在住，房态与经营数据全部错位）；超时未到的订单仍可正常入住 |
| 停用房 | 在住（OC）或当日有预抵/在住订单的房间不可停用，避免客人到店无房 |
| 退款口径 | 退房时押金富余以**负数收款**入账（`refund=true`），保证「已收合计」不被退款金额虚增、结账后余额为 0；退房接口返回的 `computed` 是**结算后**口径（补收/退款已计入） |
| 未到店 | 预抵当天及之后均可标记未到店（超时未到仍在「今日预抵」列表里以红底提示）；未来预抵不可提前标记 |
| 账单修改 | 已结账账单不可再加项/收款/作废条目；作废接口按条目类型校验（消费项与收款不可互串），且按**条目 id** 定位，不依赖返回顺序 |
| 订单编辑 | 待入住订单可修改（含房价、押金、排房、备注）；若入住日期已是过去（超时未到），允许保留原日期修改其他字段 |
| 金额边界 | 单笔金额 1 ~ 9,999,999 元、数量 1 ~ 99；超范围返回 400 而不是把数据库打成 500 |
| 枚举校验 | 任务类型（cleaning/maintenance）、任务状态（pending/doing/done）、员工角色（5 种）、渠道来源、会员等级、房型代码、房间号必须在合法集合内，否则 400 |
| 字段长度 | 姓名 ≤ 64、手机号 ≤ 32、备注 ≤ 500、账单条目名 ≤ 128 字符；超长直接 400（SQLite 不校验长度，换 MySQL 严格模式会直接报错） |
| 出租率口径 | 总览、房态、报表统一按「在住 ÷ 可售房（总房数 − 停用房）」计算，停用维修房不计入分母 |
| 房型一致性 | 订单排房必须与房间实体房型一致（服务层在入住时拦截；种子数据在写入前自检，不一致直接报错） |
| 状态快照裁剪 | `/api/state` 按登录角色裁剪：无 `billing.view` 不返回账单、无 `guests.view` 不返回客人档案、无 `settings.view` 不返回员工手机号 |

## 已知边界

- 已具备真实后端：密码 bcrypt 哈希存储、JWT 鉴权、RBAC 服务端校验；登录即真实身份，非角色切换演示。
- 本地默认 SQLite（零配置）；换 MySQL 只需改 `DATABASE_URL`，不需要改代码。
- 报表的 14 天趋势为种子历史数据；实时数据（订单/账务/房态）由数据库实时计算。
- 团队订单、夜审、多币种、分店多物业等企业级深度功能未展开，模块结构已预留扩展位。
- 演示数据含固定账号（manager / front / housekeeping / finance / admin，密码 `123456`），生产请重置员工账户并更换 `JWT_SECRET`。
- `GET /api/state` 仍是一次性全量快照（已按角色裁剪字段），单店内网场景够用；要做多店/外网暴露，应改为按模块分页拉取。
- 令牌存在 `sessionStorage`（关标签页即失效、不跨标签共享）；仍有 XSS 可读风险，未引入 httpOnly Cookie 双令牌。
- 登录接口未做失败次数限流，公网暴露前应加（网关层或应用层）。
- 无 Refresh Token，`ACCESS_TOKEN_EXPIRE_MINUTES` 到期后需重新登录。
