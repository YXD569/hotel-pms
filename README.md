# 云澜 PMS · 酒店管理系统

面向酒店内部员工的单店 PMS（Property Management System）。**原生 HTML/CSS/JS 前端 + FastAPI 后端 + MySQL 的全栈项目**：后端以聚合状态快照 `GET /api/state` 驱动前端 9 个业务页面（页面层基本零改动对接真实数据库），JWT 鉴权 + RBAC 服务端校验；并以**单镜像同时托管前端静态资源**，部署后单 URL 即可使用。

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
│   └── test_api.py           后端 E2E 测试（41 条断言，FastAPI TestClient，可空库直接运行）
├── Dockerfile / railway.toml / .dockerignore   一键部署到 Railway（单镜像托管前后端）
├── e2e-test.js               前端 API 冒烟测试（Node，对“运行中的实例”做 HTTP 级校验）
└── README.md
```

> 前端对接机制：`js/api-client.js` 的对外签名与原 Mock API 完全一致，`getState()` 仍同步返回内存缓存（页面照旧同步读取）；所有写操作改为异步调用真实 REST 接口，成功后再 `refresh()` 拉取 `GET /api/state` 刷新缓存，页面重渲染即见新数据。因此 9 个页面业务逻辑基本零改动，仅替换数据层并做最小异步适配。

## 本地运行（全栈）

### 推荐：启动后端（后端会一并托管前端）

前置：**Python 3.11+**（已在 3.13.2 上验证；3.9 及以下跑不了，见下方排错）。本机无需安装数据库，默认用 SQLite 联调。

**Windows · PowerShell（VS Code 默认终端）**

```powershell
cd C:\Users\叶晓栋\Desktop\hotel-pms\backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env -ErrorAction SilentlyContinue
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Windows · cmd**

```bat
cd C:\Users\叶晓栋\Desktop\hotel-pms\backend
py -3.13 -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements-dev.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**macOS / Linux**

```bash
cd hotel-pms/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

打开浏览器访问 `http://localhost:8000` 即可（后端同时托管 `index.html` 与 `css/`、`js/`，**无需再开静态服务器 / Live Server**）。
首次启动会自动 `CREATE TABLE` 并在数据库为空时灌入演示数据。

> `requirements-dev.txt` = 运行依赖 + 测试依赖（`httpx2`）。只部署不测试时可用 `requirements.txt`。
> 依赖已**锁定版本**，请勿改成 `>=`：starlette 1.10 起 TestClient 改用 `httpx2`，不锁版本重建环境会直接起不来。

### 在 VS Code 里运行

仓库已带 `.vscode/` 配置，打开 `hotel-pms` 文件夹即可：

| 操作 | 效果 |
|---|---|
| **F5** → 选「PMS 后端（8000，可断点）」 | 启动后端并支持断点调试（工作目录自动设为 `backend`） |
| **F5** → 选「后端测试 test_api.py」 | 断点调试 41 条断言 |
| `Ctrl+Shift+B` | 提供「初始化环境 / 启动后端（热重载）/ 跑后端测试 / 跑前端冒烟」等任务 |

`.vscode/settings.json` 已把解释器指向 `backend/.venv/Scripts/python.exe`，右下角显示的版本应为 **3.13.x**。

### 排错：在 VS Code 里起不来

| 报错关键词 | 原因 | 处理 |
|---|---|---|
| `TypeError: unsupported operand type(s) for \|: 'type' and 'NoneType'`<br>`dataclass() got an unexpected keyword argument 'slots'` | `.venv` 的解释器与包版本不匹配（如 venv 被 3.9 接管，但包装的是 3.13 的轮子） | 删掉 `.venv` 重建：`py -3.13 -m venv .venv` 再装依赖 |
| `RuntimeError: ... requires the httpx2 package` | 只装了 `requirements.txt`，缺测试依赖 | `pip install -r requirements-dev.txt` |
| `无法加载文件 ...Activate.ps1，因为在此系统上禁止运行脚本` | PowerShell 执行策略限制 | 当前窗口临时放开：`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`；或改用 cmd 的 `activate.bat` |
| `Could not import module "app.main"` | 当前目录不是 `backend`（`app` 包不在路径里） | `cd backend` 后再启动，或用仓库自带任务 / F5 |
| `ModuleNotFoundError: No module named 'uvicorn'` | 没激活虚拟环境，用的是全局 Python | 先激活，或直接用 `.venv\Scripts\python.exe -m uvicorn ...` |
| `[Errno 10048] address already in use` | 8000 端口被占用 | 换端口 `--port 8001`，或 `netstat -ano \| findstr :8000` 后结束进程 |
| 浏览器能开但页面空白 | 后端没起来（前端必须连后端） | 确认 `http://localhost:8000/api/health` 返回 `{"status":"ok",...}` |

> 若本地有 MySQL：把 `.env` 的 `DATABASE_URL` 改为 `mysql+pymysql://user:pass@localhost:3306/hotel_pms?charset=utf8mb4` 即可。

### 仅预览前端（无后端）

本版本前端只保留对接后端的数据层（`js/api-client.js`），页面启动即调用 `GET /api/state`，**必须配合后端运行**。
若只想要"纯前端 + localStorage 演示版"，可从 git 历史（提交 `b06f965`）取回当时的 `js/mock/` 与 `js/store.js` 方案（不在本次全栈改造范围内）。

## 后端 API 测试

```powershell
cd C:\Users\叶晓栋\Desktop\hotel-pms\backend
.\.venv\Scripts\Activate.ps1
python test_api.py
# 或绕开激活：.\.venv\Scripts\python.exe test_api.py
# 覆盖：health / 登录(正确·错误·无 token) / state 脱敏 / 房态数 / 创建预订 / 满房与日期校验 /
# 入住→退房(computed 含 total/balance) / 重复退房拦截 / 清洁任务联动 / 脏房入住拦截 /
# 押金富余退款口径 / 超时未到 / 条目作废类型校验 / 可售量扣除停用房 / 员工工号递增 / RBAC 越权 403
# —— 41 条断言，空库可直接运行（内部用 TestClient 上下文触发 lifespan 建表+种子）
```

## 前端 API 冒烟测试（Node，可选）

```bash
# 先按“本地运行”启动后端（或部署到 Railway 后用其域名）
node e2e-test.js                               # 默认 http://localhost:8000
BASE_URL=https://你的 railway 域名  node e2e-test.js
```

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
| `JWT_SECRET` | HS256 签名密钥（≥ 32 字节） | 生产务必覆盖 |
| `JWT_ALGORITHM` | JWT 算法 | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token 有效期（分钟） | `480`（8 小时） |
| `FRONTEND_DIR` | 前端静态目录（容器内路径） | Docker 内为 `/frontend` |
| `CORS_ORIGINS` | 跨域来源（同源部署可留默认） | 本地 `localhost` 调试用 |
| `PORT` | 监听端口（Railway 自动注入） | `8000` |

## 关键业务规则（改动前请先确认）

| 规则 | 说明 |
|---|---|
| 可售库存 | 房量按「房型房间数 − 停用（OO）房 − 该日期段已占用」计算，前端弹窗与后端校验同口径 |
| 空脏房 | `VD` 房不可直接办理入住，必须先完成清洁任务（前端候选列表已过滤，后端二次拦截） |
| 停用房 | 在住（OC）或当日有预抵/在住订单的房间不可停用，避免客人到店无房 |
| 退款口径 | 退房时押金富余以**负数收款**入账（`refund=true`），保证「已收合计」不被退款金额虚增、结账后余额为 0 |
| 未到店 | 预抵当天及之后均可标记未到店（超时未到仍在「今日预抵」列表里以红底提示）；未来预抵不可提前标记 |
| 账单修改 | 已结账账单不可再加项/收款/作废条目；作废接口按条目类型校验（消费项与收款不可互串） |
| 订单编辑 | 待入住订单可修改；若入住日期已是过去（超时未到），允许保留原日期修改其他字段 |

## 已知边界

- 已具备真实后端：密码 bcrypt 哈希存储、JWT 鉴权、RBAC 服务端校验；登录即真实身份，非角色切换演示。
- 报表的 14 天趋势为种子历史数据；实时数据（订单/账务/房态）由数据库实时计算。
- 团队订单、夜审、多币种、分店多物业等企业级深度功能未展开，模块结构已预留扩展位。
- 演示数据含固定账号（manager / front / housekeeping / finance / admin，密码 `123456`），生产请重置员工账户并更换 `JWT_SECRET`。
