/* 云澜 PMS · 业务流端到端测试（Node 环境，stub localStorage） */
'use strict';
global.window = global;
global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

require('./js/utils.js');
require('./js/mock/seed.js');
require('./js/store.js');
require('./js/mock/api.js');

var U = PMS.utils, api = PMS.api;
var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

function run() {
  api.init();
  var s = api.getState();
  var T = U.today();

  console.log('【种子数据】');
  assert(s.rooms.length === 36, '房间数 = 36，实际 ' + s.rooms.length);
  assert(s.bookings.filter(function (b) { return b.status === 'checkedin'; }).length === 5, '在住订单 = 5');
  assert(s.bookings.filter(function (b) { return b.status === 'confirmed'; }).length === 10, '待入住订单 = 10（今日6+未来4）');
  assert(s.folios.filter(function (f) { return f.status === 'open'; }).length === 5, '未结账单 = 5');

  console.log('【创建预订】');
  var created = null;
  return api.createBooking({
    guestName: '测试客人', phone: '13900001111', typeCode: 'STD_S',
    source: 'direct', arrive: T, depart: U.addDays(T, 2), price: 328, deposit: 0, roomNo: null, memo: 'e2e'
  }).then(function (b) {
    created = b;
    assert(b && b.status === 'confirmed' && b.nights === 2, '创建成功，2 晚，状态待入住');
    return api.createBooking({
      guestName: '满房测试', phone: '13900002222', typeCode: 'STD_S',
      source: 'walkin', arrive: T, depart: U.addDays(T, 1), price: 328, roomNo: null
    });
  }).then(function () {
    assert(false, '不应创建成功');
  }, function (e) {
    assert(/已满房|不可用/.test(e.message), '满房校验生效：' + e.message);
    return api.createBooking({
      guestName: '日期测试', phone: '13900003333', typeCode: 'STD_S',
      source: 'walkin', arrive: U.addDays(T, -1), depart: T, price: 100
    });
  }).then(function () {
    assert(false, '不应创建成功');
  }, function (e) {
    assert(/早于今天/.test(e.message), '过去日期校验生效：' + e.message);

    console.log('【排房 → 入住】');
    return api.freeRooms('STD_S', T, U.addDays(T, 2), created.id);
  }).then(function (free) {
    assert(free.length > 0, '有空闲房间 ' + free.length + ' 间');
    return api.assignRoom(created.id, free[0].no);
  }).then(function (b) {
    assert(b.roomNo && b.roomNo.length === 4, '已排房 ' + b.roomNo);
    return api.checkIn(created.id, b.roomNo, 500, '微信');
  }).then(function (b) {
    assert(b.status === 'checkedin', '入住成功');
    var room = api.roomByNo(b.roomNo);
    assert(room.status === 'OC' && room.bookingId === b.id, '房间状态转在住');
    var f = api.folioOfBooking(b.id);
    assert(f && f.status === 'open' && f.payments.length === 1 && f.payments[0].amount === 500, '账单开立，押金 500 入已收');
    var g = PMS.api.getState().guests.filter(function (x) { return x.phone === '13900001111'; })[0];
    assert(g && g.stays === 1, '新客人档案自动建立（新客 stays=1）');
    return api.addExtra(f.id, { name: '迷你吧·啤酒', category: '杂项', qty: 2, amount: 25 });
  }).then(function (f) {
    assert(f.extras.length === 1 && f.extras[0].amount === 25, '杂项入账成功');

    console.log('【退房结账】');
    var f = api.folioOfBooking(created.id);
    var c = api.folioComputed(f);
    assert(c.roomFee === 656, '房费 = 2 × 328 = 656，实际 ' + c.roomFee);
    assert(c.extrasTotal === 50, '杂项 = 50，实际 ' + c.extrasTotal);
    assert(c.total === 706 && c.balance === 206, '应收 706，需补收 206，实际 balance=' + c.balance);
    return api.checkOut(created.id, '现金');
  }).then(function (res) {
    assert(res.folio.status === 'settled' && res.computed.balance === 0, '账单结清，余额归零');
    var room = api.roomByNo(res.booking.roomNo);
    assert(room.status === 'VD' && !room.bookingId, '房间转空脏并释放');
    var tk = PMS.api.getState().tasks.filter(function (t) { return t.roomNo === room.no && t.status === 'pending' && t.note === '退房清洁'; })[0];
    assert(!!tk, '自动生成退房清洁任务');
    var g = PMS.api.getState().guests.filter(function (x) { return x.phone === '13900001111'; })[0];
    assert(g.spend === 706, '客人累计消费 706，实际 ' + g.spend);
    return api.checkOut(created.id, '现金');
  }).then(function () {
    assert(false, '重复退房应失败');
  }, function (e) {
    assert(/状态不允许/.test(e.message), '重复退房被拦截：' + e.message);

    console.log('【客房任务与停用】');
    var vd = PMS.api.getState().rooms.filter(function (r) { return r.status === 'VD'; })[0];
    var tk = PMS.api.getState().tasks.filter(function (t) { return t.roomNo === vd.no && t.status !== 'done'; })[0];
    return api.updateTask(tk.id, { status: 'done' });
  }).then(function (t) {
    assert(t.status === 'done' && t.doneAt, '任务完成并记录时间');
    return api.setRoomOO('0204', '测试停用');
  }).then(function (r) {
    assert(r.status === 'OO', '房间停用成功');
    return api.setRoomOO('0207', '在住停用测试');
  }).then(function () {
    assert(false, '在住房间停用应失败');
  }, function (e) {
    assert(/在住/.test(e.message), '在住房间停用被拦截：' + e.message);
    return api.restoreRoom('0204');
  }).then(function (r) {
    assert(r.status === 'VD', '停用恢复转空脏');

    console.log('【账务作废权限相关逻辑】');
    var f = api.getState().folios.filter(function (x) { return x.status === 'open'; })[0];
    var beforeExtras = api.folioComputed(f).extrasTotal;
    return api.addExtra(f.id, { name: '测试项', category: '杂项', qty: 1, amount: 10 }).then(function (f2) {
      assert(api.folioComputed(f2).extrasTotal === beforeExtras + 10, '入账后杂项 +10');
      var idx = f2.extras.length - 1;
      return api.voidExtra(f2.id, idx);
    }).then(function (f3) {
      assert(api.folioComputed(f3).extrasTotal === beforeExtras, '作废后杂项恢复原值（不计入应收）');
      console.log('\n结果：' + passed + ' 通过，' + failed + ' 失败');
      process.exit(failed ? 1 : 0);
    });
  }).catch(function (e) {
    console.error('测试异常中断：', e.message || e);
    process.exit(1);
  });
}

run();
