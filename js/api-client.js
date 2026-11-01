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
        var data = txt ? JSON.parse(txt) : null;
        if (!res.ok) {
          var m = data && data.detail ? data.detail : ('请求失败 (' + res.status + ')');
          throw { message: m };
        }
        return data;
      });
    });
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
  function folioOfBooking(bid) { return state.folios.filter(function (f) { return f.bookingId === bid; })[0] || null; }
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
    var rooms = state.rooms.filter(function (r) { return r.typeCode === typeCode; });
    var overlap = activeBookings().filter(function (b) {
      return b.id !== excludeId && b.typeCode === typeCode && b.arrive < depart && arrive < b.depart;
    });
    return { total: rooms.length, booked: overlap.length, available: rooms.length - overlap.length };
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
  // 页面按数组下标传入；服务端按条目 id 作废 —— 此处用缓存把下标翻译为 id
  function voidExtra(folioId, idx) {
    var f = folioById(folioId);
    var it = f && f.extras[idx];
    if (!it) return Promise.reject({ message: '账单条目不存在' });
    return commit(post('/api/folios/' + folioId + '/void-extra/' + it.id));
  }
  function voidPayment(folioId, idx) {
    var f = folioById(folioId);
    var it = f && f.payments[idx];
    if (!it) return Promise.reject({ message: '账单条目不存在' });
    return commit(post('/api/folios/' + folioId + '/void-payment/' + it.id));
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
