/* 云澜 PMS · 演示数据种子（相对"今天"动态生成，保证演示永远鲜活） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  /* ---------- 基础字典 ---------- */
  var ROOM_TYPES = [
    { code: 'STD_S', name: '标准单人间', basePrice: 328, capacity: 1, size: 18 },
    { code: 'STD_D', name: '标准双床房', basePrice: 388, capacity: 2, size: 24 },
    { code: 'SUP_K', name: '高级大床房', basePrice: 458, capacity: 2, size: 28 },
    { code: 'EXE_S', name: '行政套房',   basePrice: 788, capacity: 2, size: 42 }
  ];

  var STAFF = [
    { id: 'S001', name: '陈云澜', account: 'manager',  password: '123456', role: 'manager',       phone: '13801000001', status: 'active' },
    { id: 'S002', name: '苏晓',   account: 'front',    password: '123456', role: 'front',         phone: '13801000002', status: 'active' },
    { id: 'S003', name: '王秀娟', account: 'housekeeping', password: '123456', role: 'housekeeping', phone: '13801000003', status: 'active' },
    { id: 'S004', name: '李算',   account: 'finance',  password: '123456', role: 'finance',       phone: '13801000004', status: 'active' },
    { id: 'S005', name: '系统管理员', account: 'admin', password: '123456', role: 'admin',        phone: '13801000005', status: 'active' },
    { id: 'S006', name: '赵敏',   account: 'front2',   password: '123456', role: 'front',         phone: '13801000006', status: 'active' },
    { id: 'S007', name: '刘芳',   account: 'hk2',      password: '123456', role: 'housekeeping', phone: '13801000007', status: 'disabled' }
  ];

  var GUESTS_SEED = [
    { name: '周慕云', phone: '13912340001', vip: '金卡',   tags: ['常住客', '高楼层'], notes: '喜欢安静，优先安排远离电梯的房间。' },
    { name: '林晚',   phone: '13912340002', vip: '普通',   tags: [], notes: '' },
    { name: '沈之航', phone: '13912340003', vip: '银卡',   tags: ['延迟退房'], notes: '' },
    { name: '苏梨',   phone: '13912340004', vip: '普通',   tags: [], notes: '' },
    { name: '顾北辰', phone: '13912340005', vip: '钻石',   tags: ['企业协议', '常住客'], notes: '星辰科技协议价，发票抬头：星辰科技有限公司。' },
    { name: '江疏影', phone: '13912340006', vip: '普通',   tags: [], notes: '' },
    { name: '陆则明', phone: '13912340007', vip: '银卡',   tags: [], notes: '对枕头有要求，入住时主动提供荞麦枕。' },
    { name: '许安然', phone: '13912340008', vip: '普通',   tags: [], notes: '' },
    { name: '程一诺', phone: '13912340009', vip: '金卡',   tags: ['常住客'], notes: '' },
    { name: '叶清欢', phone: '13912340010', vip: '普通',   tags: [], notes: '' },
    { name: '段云鹏', phone: '13912340011', vip: '普通',   tags: [], notes: '' },
    { name: '何笑棠', phone: '13912340012', vip: '普通',   tags: [], notes: '' }
  ];

  /* ---------- 房间：3 层 × 12 间 ---------- */
  function buildRooms() {
    var rooms = [];
    var plan = [
      { floor: 2, stdS: 4, stdD: 6, supK: 2, exeS: 0 },
      { floor: 3, stdS: 0, stdD: 4, supK: 5, exeS: 3 },
      { floor: 4, stdS: 0, stdD: 0, supK: 4, exeS: 8 }
    ];
    plan.forEach(function (f) {
      var no = 1;
      pushType(f.floor, 'STD_S', f.stdS);
      pushType(f.floor, 'STD_D', f.stdD);
      pushType(f.floor, 'SUP_K', f.supK);
      pushType(f.floor, 'EXE_S', f.exeS);
      function pushType(floor, code, count) {
        for (var i = 0; i < count; i++) {
          rooms.push({
            no: '0' + floor + (no < 10 ? '0' + no : no),
            floor: floor,
            typeCode: code,
            status: 'OK',        // OK 空净 / VD 空脏 / OC 在住 / OO 停用
            bookingId: null,
            oooNote: ''
          });
          no++;
        }
      }
    });
    return rooms;
  }

  function maskId(id) {
    id = id || '';
    return id.length > 7 ? id.slice(0, 4) + '********' + id.slice(-2) : id;
  }

  /* ---------- 生成完整状态 ---------- */
  function buildState() {
    var T = U.today();
    var rooms = buildRooms();
    var bookings = [];
    var folios = [];
    var tasks = [];
    var guests = [];
    var bkSeq = 2601;
    var folioSeq = 1;
    var taskSeq = 1;

    GUESTS_SEED.forEach(function (g, i) {
      guests.push({
        id: 'G' + (101 + i),
        name: g.name,
        phone: g.phone,
        idCardMasked: maskId('3301' + (1980 + i) % 99 + (1000 + i * 37)),
        vip: g.vip,
        tags: g.tags,
        notes: g.notes,
        stays: 0,
        spend: 0,
        createdAt: U.addDays(T, -(200 + i * 17))
      });
    });

    function roomByNo(no) { return rooms.filter(function (r) { return r.no === no; })[0]; }
    function guestByName(name) { return guests.filter(function (g) { return g.name === name; })[0]; }

    function addBooking(cfg) {
      var nights = U.diffDays(cfg.arrive, cfg.depart);
      var b = {
        id: 'B' + (bkSeq++),
        guestName: cfg.guest,
        phone: cfg.phone,
        typeCode: cfg.typeCode,
        source: cfg.source,
        arrive: cfg.arrive,
        depart: cfg.depart,
        nights: nights,
        price: cfg.price,
        deposit: cfg.deposit || 0,
        roomNo: cfg.roomNo || null,
        status: cfg.status,
        memo: cfg.memo || '',
        createdAt: U.addDays(cfg.arrive, -(2 + bkSeq % 5))
      };
      bookings.push(b);
      var room = cfg.roomNo ? roomByNo(cfg.roomNo) : null;
      if (cfg.status === 'checkedin' && room) {
        room.status = 'OC';
        room.bookingId = b.id;
      }
      if (cfg.guestStats) {
        var g = guestByName(cfg.guest);
        if (g) { g.stays += cfg.guestStats[0]; g.spend += cfg.guestStats[1]; }
      }
      return b;
    }

    function addFolio(b, extras, payments, status) {
      var f = {
        id: 'F' + (folioSeq++),
        bookingId: b.id,
        roomNo: b.roomNo,
        guestName: b.guestName,
        deposit: b.deposit,
        extras: extras || [],
        payments: payments || [],
        status: status || 'open',
        settledAt: null,
        settledTotal: 0,
        invoice: false
      };
      folios.push(f);
      return f;
    }

    function addTask(roomNo, type, status, assignee, note) {
      tasks.push({
        id: 'T' + (taskSeq++),
        roomNo: roomNo,
        type: type,
        status: status,
        assignee: assignee,
        note: note || '',
        createdAt: U.addDays(T, 0) + ' ' + (8 + taskSeq % 9) + ':' + (10 + taskSeq * 7 % 50 < 10 ? '0' : '') + (10 + taskSeq * 7 % 50),
        doneAt: null
      });
    }

    /* ===== 在住（checkedin，5 间） ===== */
    var inhouse = [
      { guest: '周慕云', phone: '13912340001', typeCode: 'SUP_K', roomNo: '0311', arrive: -2, depart: 2, source: 'direct',  deposit: 1000, extras: [{ name: '迷你吧·可乐', category: '杂项', qty: 1, amount: 15, time: T + ' 21:40' }] },
      { guest: '顾北辰', phone: '13912340005', typeCode: 'EXE_S', roomNo: '0405', arrive: -1, depart: 1, source: 'corp',    deposit: 2000, extras: [{ name: '洗衣服务', category: '杂项', qty: 2, amount: 80, time: T + ' 09:15' }, { name: '行政酒廊', category: '餐饮', qty: 1, amount: 128, time: T + ' 18:02' }] },
      { guest: '陆则明', phone: '13912340007', typeCode: 'STD_D', roomNo: '0207', arrive: -3, depart: 1, source: 'ctrip',   deposit: 500,  extras: [] },
      { guest: '江疏影', phone: '13912340006', typeCode: 'STD_S', roomNo: '0202', arrive: -1, depart: 3, source: 'meituan', deposit: 300,  extras: [] },
      { guest: '程一诺', phone: '13912340009', typeCode: 'SUP_K', roomNo: '0306', arrive: 0,  depart: 2, source: 'walkin',  deposit: 600,  extras: [] }
    ];
    inhouse.forEach(function (c) {
      var price = ROOM_TYPES.filter(function (t) { return t.code === c.typeCode; })[0].basePrice;
      var b = addBooking({
        guest: c.guest, phone: c.phone, typeCode: c.typeCode, roomNo: c.roomNo,
        arrive: U.addDays(T, c.arrive), depart: U.addDays(T, c.depart),
        source: c.source, price: price, deposit: c.deposit, status: 'checkedin',
        guestStats: [1, 0]
      });
      var pays = c.deposit > 0 ? [{ amount: c.deposit, method: '微信', time: b.arrive + ' 14:05', note: '预收押金' }] : [];
      addFolio(b, c.extras, pays, 'open');
    });

    /* ===== 今日预抵（confirmed，6 单：3 已排房、3 未排房） ===== */
    var arriving = [
      { guest: '沈之航', phone: '13912340003', typeCode: 'STD_D', roomNo: '0208', depart: 3, source: 'phone', deposit: 500 },
      { guest: '苏梨',   phone: '13912340004', typeCode: 'STD_S', roomNo: null,   depart: 2, source: 'ctrip',  deposit: 300 },
      { guest: '许安然', phone: '13912340008', typeCode: 'SUP_K', roomNo: '0307', depart: 4, source: 'corp',   deposit: 800 },
      { guest: '叶清欢', phone: '13912340010', typeCode: 'STD_S', roomNo: null,   depart: 1, source: 'walkin', deposit: 0 },
      { guest: '何笑棠', phone: '13912340012', typeCode: 'STD_D', roomNo: null,   depart: 2, source: 'meituan', deposit: 300 },
      { guest: '段云鹏', phone: '13912340011', typeCode: 'EXE_S', roomNo: null,   depart: 3, source: 'direct', deposit: 1500 }
    ];
    arriving.forEach(function (c) {
      var price = ROOM_TYPES.filter(function (t) { return t.code === c.typeCode; })[0].basePrice;
      addBooking({
        guest: c.guest, phone: c.phone, typeCode: c.typeCode, roomNo: c.roomNo,
        arrive: T, depart: U.addDays(T, c.depart),
        source: c.source, price: price, deposit: c.deposit, status: 'confirmed'
      });
    });

    /* ===== 未来预抵（4 单） ===== */
    [
      { guest: '周慕云', phone: '13912340001', typeCode: 'SUP_K', arrive: 3, depart: 5, source: 'direct' },
      { guest: '林晚',   phone: '13912340002', typeCode: 'STD_S', arrive: 2, depart: 4, source: 'ctrip' },
      { guest: '程一诺', phone: '13912340009', typeCode: 'EXE_S', arrive: 5, depart: 7, source: 'corp' },
      { guest: '江疏影', phone: '13912340006', typeCode: 'STD_D', arrive: 4, depart: 6, source: 'phone' }
    ].forEach(function (c) {
      var price = ROOM_TYPES.filter(function (t) { return t.code === c.typeCode; })[0].basePrice;
      addBooking({
        guest: c.guest, phone: c.phone, typeCode: c.typeCode,
        arrive: U.addDays(T, c.arrive), depart: U.addDays(T, c.depart),
        source: c.source, price: price, status: 'confirmed'
      });
    });

    /* ===== 已结清离店（3 单） ===== */
    [
      { guest: '林晚',   phone: '13912340002', typeCode: 'STD_S', roomNo: '0201', arrive: -6, depart: -4, source: 'ctrip' },
      { guest: '苏梨',   phone: '13912340004', typeCode: 'STD_D', roomNo: '0205', arrive: -5, depart: -3, source: 'walkin' },
      { guest: '沈之航', phone: '13912340003', typeCode: 'SUP_K', roomNo: '0301', arrive: -8, depart: -6, source: 'phone' }
    ].forEach(function (c, i) {
      var price = ROOM_TYPES.filter(function (t) { return t.code === c.typeCode; })[0].basePrice;
      var b = addBooking({
        guest: c.guest, phone: c.phone, typeCode: c.typeCode, roomNo: c.roomNo,
        arrive: U.addDays(T, c.arrive), depart: U.addDays(T, c.depart),
        source: c.source, price: price, deposit: 500, status: 'checkedout',
        guestStats: [1, price * 2]
      });
      var f = addFolio(b, [], [{ amount: 500, method: '现金', time: b.arrive + ' 14:20', note: '预收押金' }], 'settled');
      f.settledAt = b.depart + ' 11:3' + i;
      f.settledTotal = price * 2;
      f.payments.push({ amount: price * 2 - 500, method: '银行卡', time: f.settledAt, note: '离店结算' });
      f.invoice = i === 0;
    });

    /* ===== 取消 / 未到 ===== */
    var priceD = ROOM_TYPES[1].basePrice;
    addBooking({ guest: '叶清欢', phone: '13912340010', typeCode: 'STD_D', arrive: U.addDays(T, 1), depart: U.addDays(T, 3), source: 'meituan', price: priceD, status: 'cancelled', memo: '客人行程变更，携程取消。' });
    addBooking({ guest: '许安然', phone: '13912340008', typeCode: 'STD_S', arrive: U.addDays(T, -1), depart: U.addDays(T, 1), source: 'ctrip', price: ROOM_TYPES[0].basePrice, status: 'noshow', memo: '过保留房时限未到店。' });

    /* ===== 空脏房间 + 清洁任务 ===== */
    ['0203', '0209', '0302', '0308'].forEach(function (no, i) {
      var r = roomByNo(no);
      r.status = 'VD';
      addTask(no, 'cleaning', i === 0 ? 'doing' : 'pending', i === 0 ? '王秀娟' : '', i === 3 ? '客人要求重点清洁卫生间' : '');
    });
    /* 历史已完成清洁任务 */
    addTask('0201', 'cleaning', 'done', '刘芳', '');
    addTask('0205', 'cleaning', 'done', '王秀娟', '');

    /* ===== 停用维修 ===== */
    var ooRoom = roomByNo('0409');
    ooRoom.status = 'OO';
    ooRoom.oooNote = '空调主机故障，等待厂商配件，预计 2 天修复。';
    addTask('0409', 'maintenance', 'doing', '王秀娟', '空调主机故障报修');

    /* ===== 近 14 天经营统计 ===== */
    var dailyStats = [];
    for (var i = 13; i >= 0; i--) {
      var d = U.addDays(T, -i);
      var occ = 68 + ((i * 13 + 5) % 23) + (i < 7 ? 4 : 0);
      var roomsSold = Math.round(occ / 100 * 34);
      var adr = 415 + ((i * 29) % 60);
      dailyStats.push({
        date: d,
        occ: Math.min(occ, 94),
        roomsSold: roomsSold,
        adr: adr,
        revenue: roomsSold * adr,
        revpar: Math.round(roomsSold * adr / 36)
      });
    }

    return {
      hotelName: '云澜大酒店',
      version: 1,
      roomTypes: ROOM_TYPES,
      rooms: rooms,
      bookings: bookings,
      guests: guests,
      folios: folios,
      tasks: tasks,
      staff: STAFF,
      dailyStats: dailyStats,
      sources: [
        { key: 'walkin', name: '上门散客' },
        { key: 'phone',  name: '电话预订' },
        { key: 'ctrip',  name: '携程' },
        { key: 'meituan', name: '美团' },
        { key: 'direct', name: '官网直销' },
        { key: 'corp',   name: '企业协议' }
      ]
    };
  }

  PMS.seed = { buildState: buildState, ROOM_TYPES: ROOM_TYPES };
})();
