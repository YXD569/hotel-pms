/* 云澜 PMS · Mock API 层（模拟网络延迟 + 业务规则 + 持久化） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var state = null;

  function delay(ms) { return new Promise(function (res) { setTimeout(res, ms || 180 + Math.random() * 220); }); }
  function ok(data) { return Promise.resolve(data); }

  function init() {
    state = PMS.store.load();
    return state;
  }
  function persist() { PMS.store.save(state); }

  /* ---------- 字典辅助 ---------- */
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

  /* ---------- 房量计算 ---------- */
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

  /* ---------- 账单计算 ---------- */
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
  function nowTime() {
    var d = new Date();
    return U.today() + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  /* ---------- 登录 ---------- */
  function login(account, password) {
    return delay(300).then(function () {
      var s = state.staff.filter(function (x) { return x.account === account; })[0];
      if (!s) return Promise.reject({ message: '账号不存在，请核对后重试' });
      if (s.password !== password) return Promise.reject({ message: '密码不正确' });
      if (s.status !== 'active') return Promise.reject({ message: '该账号已停用，请联系管理员' });
      return { id: s.id, name: s.name, account: s.account, role: s.role };
    });
  }

  /* ---------- 预订 ---------- */
  function validateBookingInput(d, excludeId) {
    if (!d.guestName || !d.guestName.trim()) return '请填写客人姓名';
    if (!U.isPhone(d.phone)) return '请填写正确的手机号';
    if (!U.isDateStr(d.arrive) || !U.isDateStr(d.depart)) return '请选择入住与离店日期';
    if (d.arrive < U.today()) return '入住日期不能早于今天';
    if (d.depart <= d.arrive) return '离店日期必须晚于入住日期';
    if (!(d.price > 0)) return '请填写有效的房价';
    var av = availability(d.typeCode, d.arrive, d.depart, excludeId);
      if (d.roomNo) {
        var free = freeRooms(d.typeCode, d.arrive, d.depart, excludeId).some(function (r) { return r.no === d.roomNo; });
        if (!free) return '所选房间在该日期段不可用';
      } else if (av.available <= 0) {
        return typeName(d.typeCode) + ' 在该日期段已满房';
      }
    return null;
  }

  function createBooking(d) {
    return delay().then(function () {
      var err = validateBookingInput(d, null);
      if (err) return Promise.reject({ message: err });
      var b = {
        id: U.uid('B'),
        guestName: d.guestName.trim(),
        phone: d.phone,
        typeCode: d.typeCode,
        source: d.source,
        arrive: d.arrive,
        depart: d.depart,
        nights: U.diffDays(d.arrive, d.depart),
        price: d.price,
        deposit: d.deposit || 0,
        roomNo: d.roomNo || null,
        status: 'confirmed',
        memo: d.memo || '',
        createdAt: U.today()
      };
      state.bookings.unshift(b);
      persist();
      return b;
    });
  }

  function updateBooking(id, d) {
    return delay().then(function () {
      var b = bookingById(id);
      if (!b) return Promise.reject({ message: '订单不存在' });
      if (b.status !== 'confirmed') return Promise.reject({ message: '仅待入住的订单可以修改' });
      var merged = {
        guestName: d.guestName, phone: d.phone, typeCode: d.typeCode, source: d.source,
        arrive: d.arrive, depart: d.depart, price: d.price, roomNo: d.roomNo || null, memo: d.memo || ''
      };
      var err = validateBookingInput(merged, id);
      if (err) return Promise.reject({ message: err });
      Object.assign(b, merged, { nights: U.diffDays(d.arrive, d.depart) });
      persist();
      return b;
    });
  }

  function assignRoom(bookingId, roomNo) {
    return delay().then(function () {
      var b = bookingById(bookingId);
      if (!b || b.status !== 'confirmed') return Promise.reject({ message: '仅待入住的订单可以排房' });
      var free = freeRooms(b.typeCode, b.arrive, b.depart, b.id).some(function (r) { return r.no === roomNo; });
      if (!free) return Promise.reject({ message: '该房间在此日期段不可用' });
      b.roomNo = roomNo;
      persist();
      return b;
    });
  }

  function cancelBooking(id) {
    return delay().then(function () {
      var b = bookingById(id);
      if (!b || b.status !== 'confirmed') return Promise.reject({ message: '仅待入住的订单可以取消' });
      b.status = 'cancelled';
      persist();
      return b;
    });
  }

  function markNoshow(id) {
    return delay().then(function () {
      var b = bookingById(id);
      if (!b || b.status !== 'confirmed') return Promise.reject({ message: '仅待入住的订单可标记未到店' });
      if (b.arrive !== U.today()) return Promise.reject({ message: '只能在预抵当天标记未到店' });
      b.status = 'noshow';
      b.roomNo = null;
      persist();
      return b;
    });
  }

  /* ---------- 入住 / 退房 ---------- */
  function checkIn(bookingId, roomNo, deposit, method) {
    return delay().then(function () {
      var b = bookingById(bookingId);
      if (!b || b.status !== 'confirmed') return Promise.reject({ message: '订单状态不允许办理入住' });
      var target = roomNo || b.roomNo;
      if (!target) return Promise.reject({ message: '请先为该订单选择房间' });
      var room = roomByNo(target);
      if (!room || room.typeCode !== b.typeCode) return Promise.reject({ message: '房间与房型不匹配' });
      if (room.status === 'OO') return Promise.reject({ message: '该房间已停用，不能安排入住' });
      var free = freeRooms(b.typeCode, b.arrive, b.depart, b.id).some(function (r) { return r.no === target; });
      if (!free) return Promise.reject({ message: '该房间在此日期段已被占用' });

      b.status = 'checkedin';
      b.roomNo = target;
      b.deposit = deposit;
      room.status = 'OC';
      room.bookingId = b.id;

      var payments = [];
      if (deposit > 0) payments.push({ amount: deposit, method: method || '现金', time: nowTime(), note: '预收押金' });
      state.folios.unshift({
        id: U.uid('F'), bookingId: b.id, roomNo: target, guestName: b.guestName,
        deposit: deposit, extras: [], payments: payments,
        status: 'open', settledAt: null, settledTotal: 0, invoice: false
      });

      var g = state.guests.filter(function (x) { return x.phone === b.phone; })[0];
      if (g) { g.stays += 1; }
      else {
        state.guests.unshift({
          id: U.uid('G'), name: b.guestName, phone: b.phone, idCardMasked: '',
          vip: '普通', tags: [], notes: '', stays: 1, spend: 0, createdAt: U.today()
        });
      }
      persist();
      return b;
    });
  }

  function checkOut(bookingId, method) {
    return delay().then(function () {
      var b = bookingById(bookingId);
      if (!b || b.status !== 'checkedin') return Promise.reject({ message: '订单状态不允许办理退房' });
      var f = folioOfBooking(bookingId);
      if (!f) return Promise.reject({ message: '找不到关联账单' });
      var c = folioComputed(f);
      if (c.balance > 0) {
        f.payments.push({ amount: c.balance, method: method, time: nowTime(), note: '离店补收' });
      } else if (c.balance < 0) {
        f.payments.push({ amount: -c.balance, method: '现金', time: nowTime(), note: '押金退还', refund: true });
      }
      f.status = 'settled';
      f.settledAt = nowTime();
      f.settledTotal = c.total;

      b.status = 'checkedout';
      var room = roomByNo(b.roomNo);
      if (room) { room.status = 'VD'; room.bookingId = null; }
      state.tasks.unshift({
        id: U.uid('T'), roomNo: b.roomNo, type: 'cleaning', status: 'pending',
        assignee: '', note: '退房清洁', createdAt: nowTime(), doneAt: null
      });
      var g = state.guests.filter(function (x) { return x.phone === b.phone; })[0];
      if (g) g.spend += c.total;
      persist();
      return { booking: b, folio: f, computed: folioComputed(f) };
    });
  }

  /* ---------- 账务 ---------- */
  function addExtra(folioId, item) {
    return delay().then(function () {
      var f = folioById(folioId);
      if (!f || f.status !== 'open') return Promise.reject({ message: '仅未结账账单可以加项' });
      if (!(item.amount > 0)) return Promise.reject({ message: '请填写有效金额' });
      f.extras.push({ name: item.name, category: item.category, qty: item.qty || 1, amount: item.amount, time: nowTime(), voided: false });
      persist();
      return f;
    });
  }
  function addPayment(folioId, amount, method, note) {
    return delay().then(function () {
      var f = folioById(folioId);
      if (!f || f.status !== 'open') return Promise.reject({ message: '仅未结账账单可以收款' });
      if (!(amount > 0)) return Promise.reject({ message: '请填写有效金额' });
      f.payments.push({ amount: amount, method: method, time: nowTime(), note: note || '账房收款', voided: false });
      persist();
      return f;
    });
  }
  function voidExtra(folioId, idx) {
    return delay().then(function () {
      var f = folioById(folioId);
      if (!f) return Promise.reject({ message: '账单不存在' });
      if (f.extras[idx].voided) return Promise.reject({ message: '该条目已作废' });
      f.extras[idx].voided = true;
      persist();
      return f;
    });
  }
  function voidPayment(folioId, idx) {
    return delay().then(function () {
      var f = folioById(folioId);
      if (!f) return Promise.reject({ message: '账单不存在' });
      if (f.payments[idx].voided) return Promise.reject({ message: '该条目已作废' });
      f.payments[idx].voided = true;
      persist();
      return f;
    });
  }
  function setInvoice(folioId, on) {
    return delay().then(function () {
      var f = folioById(folioId);
      if (!f) return Promise.reject({ message: '账单不存在' });
      if (f.status !== 'settled') return Promise.reject({ message: '仅已结账账单可以开票' });
      f.invoice = !!on;
      persist();
      return f;
    });
  }

  /* ---------- 客房任务 ---------- */
  function createTask(roomNo, type, note, assignee) {
    return delay().then(function () {
      state.tasks.unshift({
        id: U.uid('T'), roomNo: roomNo, type: type, status: 'pending',
        assignee: assignee || '', note: note || '', createdAt: nowTime(), doneAt: null
      });
      persist();
      return state.tasks[0];
    });
  }
  function updateTask(id, patch) {
    return delay().then(function () {
      var t = state.tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return Promise.reject({ message: '任务不存在' });
      if (patch.status) {
        t.status = patch.status;
        if (patch.status === 'done') {
          t.doneAt = nowTime();
          var r = roomByNo(t.roomNo);
          if (r && t.type === 'cleaning' && r.status === 'VD') r.status = 'OK';
        }
      }
      if (patch.assignee !== undefined) t.assignee = patch.assignee;
      if (patch.note !== undefined) t.note = patch.note;
      persist();
      return t;
    });
  }
  function setRoomOO(roomNo, note) {
    return delay().then(function () {
      var r = roomByNo(roomNo);
      if (!r) return Promise.reject({ message: '房间不存在' });
      if (r.status === 'OC') return Promise.reject({ message: '在住房间不能直接停用，请先办理退房' });
      r.status = 'OO';
      r.oooNote = note || '';
      persist();
      return r;
    });
  }
  function restoreRoom(roomNo) {
    return delay().then(function () {
      var r = roomByNo(roomNo);
      if (!r || r.status !== 'OO') return Promise.reject({ message: '该房间不在停用状态' });
      r.status = 'VD';
      r.oooNote = '';
      persist();
      return r;
    });
  }

  /* ---------- 设置 ---------- */
  function upsertStaff(s) {
    return delay().then(function () {
      if (!s.name || !s.account) return Promise.reject({ message: '姓名与账号必填' });
      if (state.staff.some(function (x) { return x.account === s.account && x.id !== s.id; })) {
        return Promise.reject({ message: '账号已存在' });
      }
      if (s.id) {
        var old = state.staff.filter(function (x) { return x.id === s.id; })[0];
        if (old) Object.assign(old, s);
      } else {
        state.staff.push({
          id: U.uid('S'), name: s.name, account: s.account,
          password: s.password || '123456', role: s.role,
          phone: s.phone || '', status: 'active'
        });
      }
      persist();
      return true;
    });
  }
  function toggleStaff(id) {
    return delay().then(function () {
      var s = state.staff.filter(function (x) { return x.id === id; })[0];
      if (!s) return Promise.reject({ message: '员工不存在' });
      if (s.account === PMS.auth.current().account) return Promise.reject({ message: '不能停用当前登录账号' });
      s.status = s.status === 'active' ? 'disabled' : 'active';
      persist();
      return s;
    });
  }
  function updateRoomType(code, patch) {
    return delay().then(function () {
      var t = typeByCode(code);
      if (!t) return Promise.reject({ message: '房型不存在' });
      if (!(patch.basePrice > 0)) return Promise.reject({ message: '请填写有效价格' });
      t.basePrice = patch.basePrice;
      t.name = patch.name || t.name;
      persist();
      return t;
    });
  }
  function resetData() {
    state = PMS.store.reset();
    return ok(state);
  }

  /* ---------- 聚合查询 ---------- */
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
      occRate: Math.round(oc / total * 100),
      arrivalsToday: arrivalsToday, arrivalsOverdue: arrivals.filter(function (b) { return b.arrive < T; }),
      departuresToday: departuresToday, inhouse: inhouse,
      revenueToday: revenueToday,
      pendingTasks: pendingTasks,
      unassigned: arrivals.filter(function (b) { return !b.roomNo; }),
      openFolios: openFolios,
      stats: state.dailyStats
    };
  }

  PMS.api = {
    init: init,
    getState: function () { return state; },
    persist: persist,
    typeName: typeName, typeByCode: typeByCode, roomByNo: roomByNo,
    bookingById: bookingById, folioById: folioById, folioOfBooking: folioOfBooking,
    sourceName: sourceName, BK_STATUS: BK_STATUS, ROOM_STATUS: ROOM_STATUS,
    availability: availability, freeRooms: freeRooms, folioComputed: folioComputed,
    login: login,
    createBooking: createBooking, updateBooking: updateBooking, assignRoom: assignRoom,
    cancelBooking: cancelBooking, markNoshow: markNoshow,
    checkIn: checkIn, checkOut: checkOut,
    addExtra: addExtra, addPayment: addPayment, voidExtra: voidExtra, voidPayment: voidPayment, setInvoice: setInvoice,
    createTask: createTask, updateTask: updateTask, setRoomOO: setRoomOO, restoreRoom: restoreRoom,
    upsertStaff: upsertStaff, toggleStaff: toggleStaff, updateRoomType: updateRoomType, resetData: resetData,
    dashboard: dashboard
  };
})();
