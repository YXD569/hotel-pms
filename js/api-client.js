/* 云澜 PMS · HTTP API 客户端（对接 FastAPI 后端，替代原 js/mock/api.js）
 *
 * 设计要点（与原 Mock API 保持完全一致的对外签名，9 个页面零改动）：
 * 1. getState() 同步返回内存中的聚合状态缓存（GET /api/state 的快照），页面层照旧同步读取。
 * 2. 所有写操作调用真实 REST 接口，成功后自动 refresh() 刷新缓存，再 resolve，页面重渲染即见新数据。
 * 3. availability / freeRooms / folioComputed / dashboard 等纯派生计算仍基于缓存本地完成（同步）。
 * 4. 登录成功后把 JWT 写入 PMS.auth 会话（随会话持久化、随登出清除）；所有请求自动带 Bearer。
 * 5. 401 自动清除会话并跳回登录页。
 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var state = null; // 聚合状态缓存

  /* ---------- HTTP 基础 ---------- */
  function token() {
    var u = PMS.auth.current();
    return u && u.token ? u.token : null;
  }

  function req(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch(path, {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body),
    }).then(function (res) {
      if (res.status === 401) {
        // 令牌失效：清会话并跳回登录页（登录页本身已在 #/login 时为 no-op）
        PMS.auth.logout();
        if (location.hash !== '#/login') location.hash = '#/login';
        return res.text().then(function (txt) {
          var msg = '登录已失效，请重新登录';
          try { var d = JSON.parse(txt); if (d && d.detail) msg = d.detail; } catch (e) {}
          throw { message: msg };
        });
      }
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) throw { message: detailText(data, res.status) };
        if (txt && data === null) throw { message: '服务器返回了非预期内容（HTTP ' + res.status + '）' };
        return data;
      });
    }, function () {
      // 第二个回调只接 fetch 本身的失败（后端没启动 / 断网 / 地址打开方式不对），
      // 上面的业务错误不会落到这里，所以不会把「密码错误」误报成离线。
      throw { message: '无法连接服务器。' + diagnose(), offline: true };
    });
  }

  /* 请求失败时给出「为什么会连不上」的具体判断，而不是一句干巴巴的提示。
     file:// 双击、照抄 0.0.0.0、误用静态服务器，是本地开发 90% 的失败原因，逐条分辨。
     不假设后端一定是 8000 端口 —— 用户完全可能用 --port 8001，
     所以只把「已知的静态服务器端口」判为用错工具，其余本地端口一律按「服务没起」处理。
     部署到线上（域名 + 80/443）时这些分支都不会命中，只落到最后一句通用提示。 */
  function diagnose() {
    var p = location.protocol;
    var host = location.hostname;
    var port = location.port;
    var isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
    var STATIC_SERVERS = { '5500': 'VS Code Live Server', '5501': 'VS Code Live Server', '3000': '前端脚手架', '5173': 'Vite', '8080': '通用静态服务器' };

    if (p === 'file:') {
      return '当前是双击 index.html 用 file:// 打开的，浏览器不允许它请求后端接口。'
        + '请在地址栏手动输入 http://localhost:8000 打开。';
    }
    if (host === '0.0.0.0') {
      return '0.0.0.0 是后端「监听所有网卡」的地址，不是可访问地址，浏览器会直接拒绝（ERR_ADDRESS_INVALID）。'
        + '请在地址栏输入 http://localhost:8000 或 http://127.0.0.1:8000。';
    }
    if (isLocalHost && STATIC_SERVERS[port]) {
      return '当前是 ' + port + ' 端口（' + STATIC_SERVERS[port] + '）。本项目前端由后端同源托管，'
        + '不需要单独的静态服务器。请关掉它，直接访问 http://localhost:8000。';
    }
    if (isLocalHost) {
      return '本机 ' + (port || '80') + ' 端口没有响应，后端可能已停止。'
        + '请回到终端确认有 "Uvicorn running on ..." 且端口与地址栏一致，没有就重新启动。';
    }
    return '无法连接服务器，请确认后端已启动（默认 http://localhost:8000）。';
  }

  /* 错误详情转可读文案：字符串直接用；FastAPI 的 422 校验错误是数组，需拼成一句中文提示 */
  function detailText(data, status) {
    var d = data && data.detail;
    if (typeof d === 'string' && d) return d;
    if (Array.isArray(d) && d.length) {
      var parts = d.map(function (x) {
        if (!x || !x.msg) return '';
        var loc = Array.isArray(x.loc) ? x.loc[x.loc.length - 1] : '';
        return (loc ? loc + ': ' : '') + x.msg;
      }).filter(Boolean);
      if (parts.length) return '参数不合法 — ' + parts.join('；');
    }
    return '请求失败（HTTP ' + status + '）';
  }
  function get(p) { return req('GET', p); }
  function post(p, b) { return req('POST', p, b); }
  function put(p, b) { return req('PUT', p, b); }

  /* ---------- 状态缓存 ---------- */
  function refresh() {
    return get('/api/state').then(function (data) { state = data; return state; });
  }
  function getState() { return state; }

  // 启动时：PMS.auth.restore() 已由 main.js 先执行，此处用已恢复的 token 拉取全量数据
  function init() {
    if (!token()) return Promise.resolve(null);
    return refresh().catch(function () { return null; });
  }

  // 写操作通用：调接口 -> 刷新缓存 -> 返回接口原始结果（供页面直接消费）
  function commit(promise) {
    return promise.then(function (res) {
      return refresh().then(function () { return res; });
    });
  }

  /* ---------- 登录 / 登出 ---------- */
  function login(account, password) {
    return post('/api/auth/login', { account: account, password: password }).then(function (data) {
      var u = data.user;
      u.token = data.access_token;          // 把 JWT 挂到会话上，随会话一起存取
      PMS.auth.setSession(u);
      return refresh().then(function () { return u; });
    });
  }
  function logout() { PMS.auth.logout(); }

  /* ---------- 字典辅助（基于缓存） ---------- */
  function typeName(code) {
    var t = state.roomTypes.filter(function (x) { return x.code === code; })[0];
    return t ? t.name : code;
  }
  function typeByCode(code) {
    return state.roomTypes.filter(function (x) { return x.code === code; })[0] || null;
  }
  function roomByNo(no) { return state.rooms.filter(function (r) { return r.no === no; })[0] || null; }
  function bookingById(id) { return state.bookings.filter(function (b) { return b.id === id; })[0] || null; }
  function folioById(id) { return state.folios.filter(function (f) { return f.id === id; })[0] || null; }
  function folioOfBooking(bid) {
    var list = state.folios.filter(function (f) { return f.bookingId === bid; });
    // 优先未结账账单：历史账单可能因重置/重开而留下已结账记录
    return list.filter(function (f) { return f.status === 'open'; })[0] || list[0] || null;
  }
  function sourceName(key) {
    var s = state.sources.filter(function (x) { return x.key === key; })[0];
    return s ? s.name : key;
  }

  var BK_STATUS = {
    confirmed:  { label: '待入住', cls: 'bg-blue' },
    checkedin:  { label: '在住',   cls: 'bg-green' },
    checkedout: { label: '已离店', cls: 'bg-grey' },
    cancelled:  { label: '已取消', cls: 'bg-grey' },
    noshow:     { label: '未到店', cls: 'bg-red' }
  };
  var ROOM_STATUS = {
    OK: { label: '空净', cls: 'bg-green' },
    VD: { label: '空脏', cls: 'bg-amber' },
    OC: { label: '在住', cls: 'bg-blue' },
    OO: { label: '停用', cls: 'bg-red' }
  };

  /* ---------- 房量计算（基于缓存，同步） ---------- */
  function activeBookings() {
    return state.bookings.filter(function (b) { return b.status === 'confirmed' || b.status === 'checkedin'; });
  }
  function availability(typeCode, arrive, depart, excludeId) {
    // 停用（OO）房不计入可售库存，与后端 availability 口径一致
    var rooms = state.rooms.filter(function (r) { return r.typeCode === typeCode && r.status !== 'OO'; });
    var overlap = activeBookings().filter(function (b) {
      return b.id !== excludeId && b.typeCode === typeCode && b.arrive < depart && arrive < b.depart;
    });
    return { total: rooms.length, booked: overlap.length, available: Math.max(0, rooms.length - overlap.length) };
  }
  function freeRooms(typeCode, arrive, depart, excludeId) {
    var busyNos = {};
    activeBookings().forEach(function (b) {
      if (b.id !== excludeId && b.roomNo && b.arrive < depart && arrive < b.depart) busyNos[b.roomNo] = true;
    });
    return state.rooms.filter(function (r) {
      return r.typeCode === typeCode && r.status !== 'OO' && !busyNos[r.no];
    });
  }

  /* ---------- 账单计算（基于缓存，同步） ---------- */
  function accruedNights(b) {
    var T = U.today();
    var end = T < b.depart ? T : b.depart;
    var n = U.diffDays(b.arrive, end) + (T < b.depart ? 1 : 0);
    return Math.max(0, Math.min(n, b.nights));
  }
  function folioComputed(f) {
    var b = bookingById(f.bookingId);
    var roomFee = b ? b.nights * b.price : 0;
    var roomFeeSoFar = b ? accruedNights(b) * b.price : 0;
    var extrasTotal = 0;
    f.extras.forEach(function (e) { if (!e.voided) extrasTotal += e.amount * e.qty; });
    var paid = 0;
    f.payments.forEach(function (p) { if (!p.voided) paid += p.amount; });
    var total = roomFee + extrasTotal;
    return {
      nights: b ? b.nights : 0,
      nightsSoFar: b ? accruedNights(b) : 0,
      roomFee: roomFee, roomFeeSoFar: roomFeeSoFar,
      extrasTotal: extrasTotal, paid: paid,
      total: total, balance: total - paid
    };
  }

  /* ---------- 经营总览聚合（基于缓存，同步） ---------- */
  function dashboard() {
    var T = U.today();
    var rooms = state.rooms;
    var total = rooms.length;
    var oc = rooms.filter(function (r) { return r.status === 'OC'; }).length;
    var vd = rooms.filter(function (r) { return r.status === 'VD'; }).length;
    var oo = rooms.filter(function (r) { return r.status === 'OO'; }).length;
    var okc = rooms.filter(function (r) { return r.status === 'OK'; }).length;
    var arrivals = state.bookings.filter(function (b) { return b.status === 'confirmed' && b.arrive <= T; });
    var arrivalsToday = arrivals.filter(function (b) { return b.arrive === T; });
    var departuresToday = state.bookings.filter(function (b) { return b.status === 'checkedin' && b.depart === T; });
    var inhouse = state.bookings.filter(function (b) { return b.status === 'checkedin'; });
    var revenueToday = 0;
    inhouse.forEach(function (b) { revenueToday += b.price; });
    var pendingTasks = state.tasks.filter(function (t) { return t.status !== 'done'; });
    var openFolios = state.folios.filter(function (f) { return f.status === 'open'; });
    return {
      roomTotal: total, oc: oc, vd: vd, oo: oo, ok: okc,
      occRate: total ? Math.round(oc / total * 100) : 0,
      arrivalsToday: arrivalsToday, arrivalsOverdue: arrivals.filter(function (b) { return b.arrive < T; }),
      departuresToday: departuresToday, inhouse: inhouse,
      revenueToday: revenueToday,
      pendingTasks: pendingTasks,
      unassigned: arrivals.filter(function (b) { return !b.roomNo; }),
      openFolios: openFolios,
      stats: state.dailyStats
    };
  }

  /* ---------- 预订 ---------- */
  function createBooking(d) { return commit(post('/api/bookings', d)); }
  function updateBooking(id, d) { return commit(put('/api/bookings/' + id, d)); }
  function assignRoom(bid, roomNo) { return commit(post('/api/bookings/' + bid + '/assign', { roomNo: roomNo })); }
  function cancelBooking(id) { return commit(post('/api/bookings/' + id + '/cancel')); }
  function markNoshow(id) { return commit(post('/api/bookings/' + id + '/noshow')); }

  /* ---------- 入住 / 退房 ---------- */
  function checkIn(bid, roomNo, deposit, method) {
    return commit(post('/api/reception/checkin', {
      bookingId: bid, roomNo: roomNo || null, deposit: deposit || 0, method: method || '现金',
    }));
  }
  function checkOut(bid, method) {
    return commit(post('/api/reception/checkout', { bookingId: bid, method: method || '现金' }));
  }

  /* ---------- 账务 ---------- */
  function addExtra(folioId, item) { return commit(post('/api/folios/' + folioId + '/extra', item)); }
  function addPayment(folioId, amount, method, note) {
    return commit(post('/api/folios/' + folioId + '/pay', { amount: amount, method: method || '现金', note: note || '' }));
  }
  // 服务端按条目 id 作废：页面直接传条目 id（或条目对象）。
  // 注意不要按「数组下标」传 —— 下标依赖后端返回顺序（MySQL 无 ORDER BY 不保证），
  // 一旦顺序变了就会作废到别的条目上。
  function itemId(item) {
    if (item && typeof item === 'object') return item.id;
    return item;
  }
  function voidExtra(folioId, item) {
    var id = itemId(item);
    if (id == null) return Promise.reject({ message: '账单条目不存在' });
    return commit(post('/api/folios/' + folioId + '/void-extra/' + id));
  }
  function voidPayment(folioId, item) {
    var id = itemId(item);
    if (id == null) return Promise.reject({ message: '账单条目不存在' });
    return commit(post('/api/folios/' + folioId + '/void-payment/' + id));
  }
  function setInvoice(folioId, on) { return commit(post('/api/folios/' + folioId + '/invoice', { invoice: !!on })); }

  /* ---------- 客房任务 ---------- */
  function createTask(roomNo, type, note, assignee) {
    return commit(post('/api/tasks', { roomNo: roomNo, type: type, note: note || '', assignee: assignee || '' }));
  }
  function updateTask(id, patch) { return commit(put('/api/tasks/' + id, patch)); }

  /* ---------- 房态 ---------- */
  function setRoomOO(roomNo, note) { return commit(post('/api/rooms/' + roomNo + '/oo', { note: note || '' })); }
  function restoreRoom(roomNo) { return commit(post('/api/rooms/' + roomNo + '/restore')); }

  /* ---------- 设置 ---------- */
  function upsertStaff(s) { return commit(post('/api/staff', s)); }
  function toggleStaff(id) { return commit(post('/api/staff/' + id + '/toggle')); }
  function updateRoomType(code, patch) { return commit(put('/api/room-types/' + code, patch)); }
  function resetData() { return commit(post('/api/reset')); }

  /* ---------- 客人档案 ---------- */
  function createGuest(d) { return commit(post('/api/guests', d)); }
  function updateGuest(gid, patch) { return commit(put('/api/guests/' + gid, patch)); }

  function persist() { /* 后端已持久化，无需本地存储 */ }

  PMS.api = {
    init: init,
    getState: getState,
    refresh: refresh,
    persist: persist,
    login: login,
    logout: logout,
    typeName: typeName, typeByCode: typeByCode, roomByNo: roomByNo,
    bookingById: bookingById, folioById: folioById, folioOfBooking: folioOfBooking,
    sourceName: sourceName, BK_STATUS: BK_STATUS, ROOM_STATUS: ROOM_STATUS,
    availability: availability, freeRooms: freeRooms, folioComputed: folioComputed,
    dashboard: dashboard,
    createBooking: createBooking, updateBooking: updateBooking, assignRoom: assignRoom,
    cancelBooking: cancelBooking, markNoshow: markNoshow,
    checkIn: checkIn, checkOut: checkOut,
    addExtra: addExtra, addPayment: addPayment, voidExtra: voidExtra, voidPayment: voidPayment, setInvoice: setInvoice,
    createTask: createTask, updateTask: updateTask, setRoomOO: setRoomOO, restoreRoom: restoreRoom,
    upsertStaff: upsertStaff, toggleStaff: toggleStaff, updateRoomType: updateRoomType, resetData: resetData,
    createGuest: createGuest, updateGuest: updateGuest
  };
})();
