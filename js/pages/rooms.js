/* 云澜 PMS · 房态看板（当日房态 + 7 日房态） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;
  var api = PMS.api;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16"/><path d="M3 21h15"/><path d="M13 12h.01"/><path d="M17 8h3a1 1 0 0 1 1 1v12"/></svg>';

  var currentView = 'day';
  var hostEl = null;

  /* 房间的展示状态：OK/VD/OC/OO 之上叠加"预抵"标记 */
  function roomDisplay(r, T) {
    var rv = null;
    PMS.api.getState().bookings.forEach(function (b) {
      if (b.status === 'confirmed' && b.roomNo === r.no && b.arrive <= T && T < b.depart) rv = b;
    });
    var base = r.status;
    var chip = base;
    var info = '';
    var tag = '';
    if (base === 'OC') {
      tag = '住';
      var b = PMS.api.getState().bookings.filter(function (x) { return x.id === r.bookingId; })[0];
      info = b ? b.guestName + ' · ' + U.fmtDateCn(b.depart).slice(0, 6) + '离' : '';
    } else if (base === 'OO') {
      tag = '修'; info = r.oooNote || '停用维修';
    } else if (rv) {
      chip = 'RV'; tag = '预'; info = '预抵 · ' + rv.guestName + (rv.arrive < T ? '（超时）' : '');
    } else if (base === 'VD') {
      tag = '脏'; info = '待清洁';
    } else {
      tag = '净'; info = '可售';
    }
    return { chip: chip, tag: tag, info: info, rvBooking: rv };
  }

  function render(host) {
    hostEl = host;
    document.title = '房态看板 · 云澜 PMS';
    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">房态看板</div></div>' +
        '<div class="page-sub">点击房间查看详情与快捷操作</div>' +
        '<div class="page-actions">' +
          '<button class="btn ' + (currentView === 'day' ? 'btn-primary' : 'btn-ghost') + '" data-view="day">当日房态</button>' +
          '<button class="btn ' + (currentView === 'week' ? 'btn-primary' : 'btn-ghost') + '" data-view="week">7 日房态</button>' +
        '</div>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:16px">' +
          legendHtml() + countsHtml() +
        '</div>' +
        '<div id="boardHost"></div>' +
      '</div>';

    U.qsa('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentView = btn.getAttribute('data-view');
        render(host);
      });
    });
    renderBoard();
  }

  function legendHtml() {
    return '<div class="legend">' +
      '<span class="lg-item"><span class="lg-swatch" style="background:var(--st-ok)"></span>空净</span>' +
      '<span class="lg-item"><span class="lg-swatch" style="background:var(--st-vd)"></span>空脏</span>' +
      '<span class="lg-item"><span class="lg-swatch" style="background:var(--st-oc)"></span>在住</span>' +
      '<span class="lg-item"><span class="lg-swatch" style="background:var(--st-rv)"></span>预抵</span>' +
      '<span class="lg-item"><span class="lg-swatch" style="background:var(--st-oo)"></span>停用维修</span>' +
    '</div>';
  }

  function countsHtml() {
    var s = PMS.api.getState();
    var T = U.today();
    var c = { OK: 0, VD: 0, OC: 0, OO: 0, RV: 0 };
    s.rooms.forEach(function (r) { c[roomDisplay(r, T).chip]++; });
    return '<div style="font-size:12.5px;color:var(--ink-2)">共 ' + s.rooms.length + ' 间 · ' +
      '在住 <b>' + c.OC + '</b> · 空净 <b>' + c.OK + '</b> · 空脏 <b>' + c.VD + '</b> · 预抵 <b>' + c.RV + '</b> · 停用 <b>' + c.OO + '</b></div>';
  }

  function renderBoard() {
    var board = U.qs('#boardHost');
    if (currentView === 'day') board.innerHTML = dayBoardHtml();
    else board.innerHTML = weekBoardHtml();
    U.qsa('.room-chip', board).forEach(function (chip) {
      chip.addEventListener('click', function () {
        openRoomDrawer(chip.getAttribute('data-room'));
      });
    });
  }

  function dayBoardHtml() {
    var s = PMS.api.getState();
    var T = U.today();
    var floors = {};
    s.rooms.forEach(function (r) {
      (floors[r.floor] = floors[r.floor] || []).push(r);
    });
    return Object.keys(floors).map(function (f) {
      var row = floors[f];
      return '<div class="floor-row"><div class="floor-label">' + f + 'F · ' + row.length + ' 间</div><div class="room-grid">' +
        row.map(function (r) {
          var d = roomDisplay(r, T);
          return '<button type="button" class="room-chip rc-' + d.chip + '" data-room="' + r.no + '">' +
            '<span class="rc-no">' + r.no + '</span>' +
            '<span class="rc-tag">' + d.tag + '</span>' +
            '<div class="rc-info">' + U.escapeHtml(d.info) + '</div></button>';
        }).join('') + '</div></div>';
    }).join('');
  }

  function weekBoardHtml() {
    var s = PMS.api.getState();
    var T = U.today();
    var days = [];
    for (var i = 0; i < 7; i++) days.push(U.addDays(T, i));
    var actives = s.bookings.filter(function (b) { return b.status === 'confirmed' || b.status === 'checkedin'; });
    var rows = s.rooms.map(function (r) {
      var cells = days.map(function (day, di) {
        var b = actives.filter(function (x) { return x.roomNo === r.no && x.arrive <= day && day < x.depart; })[0];
        if (r.status === 'OO') {
          return '<div class="wk-cell bk-oo" title="停用维修">修</div>';
        }
        if (!b) return '<div class="wk-cell"></div>';
        var cls = b.status === 'checkedin' ? 'bk-checkedin' : 'bk-confirmed';
        var label = (di === 0 && b.arrive === day) ? '入' : (day === U.addDays(b.depart, -1) ? '离' : '·');
        return '<div class="wk-cell ' + cls + '" title="' + U.escapeHtml(r.no + ' ' + b.guestName + ' ' + b.arrive + '~' + b.depart + ' ' + api.typeName(b.typeCode)) + '">' + label + '</div>';
      }).join('');
      return '<div class="wk-room">' + r.no + '</div>' + cells;
    }).join('');
    return '<div class="week-board"><div class="week-grid">' +
      '<div class="wk-head" style="text-align:left;padding-left:6px">房间</div>' +
      days.map(function (day, i) {
        return '<div class="wk-head' + (i === 0 ? ' is-today' : '') + '">' +
          (i === 0 ? '今天 ' : '') + day.slice(5) + ' 周' + U.weekLabel(day).slice(1) + '</div>';
      }).join('') +
      rows + '</div></div>';
  }

  /* ---------- 房间详情抽屉 ---------- */
  function openRoomDrawer(no) {
    var api = PMS.api;
    var r = api.roomByNo(no);
    if (!r) return;
    var T = U.today();
    var d = roomDisplay(r, T);
    var t = api.typeByCode(r.typeCode);
    var booking = null, folio = null;
    if (r.bookingId) booking = api.bookingById(r.bookingId);
    if (booking) folio = api.folioOfBooking(booking.id);
    if (!booking && d.rvBooking) booking = d.rvBooking;
    var can = PMS.auth.can.bind(PMS.auth);

    var body = '<div class="info-list" style="margin-bottom:16px">' +
      row('房间号', '<b>' + r.no + '</b>') +
      row('房型', U.escapeHtml(t ? t.name : r.typeCode)) +
      row('门市价', U.fmtMoney(t ? t.basePrice : 0) + ' / 晚') +
      row('当前状态', statusBadge(d.chip)) +
      (r.status === 'OO' && r.oooNote ? row('停用原因', U.escapeHtml(r.oooNote)) : '') +
    '</div>';

    if (booking && (d.chip === 'OC' || d.chip === 'RV')) {
      var c = folio ? api.folioComputed(folio) : null;
      body += '<div class="card-title" style="margin-top:4px">' + (d.chip === 'OC' ? '在住信息' : '预抵订单') + '</div>' +
        '<div class="info-list">' +
        row('客人', U.escapeHtml(booking.guestName)) +
        row('手机', U.escapeHtml(booking.phone)) +
        row('入住', booking.arrive + ' ' + U.weekLabel(booking.arrive)) +
        row('预离', booking.depart + ' ' + U.weekLabel(booking.depart) + '（' + booking.nights + ' 晚）') +
        row('协议价', U.fmtMoney(booking.price) + ' / 晚') +
        (c ? row('账单余额', (c.balance >= 0 ? '<span style="color:var(--danger)">需补收 ' + U.fmtMoney(c.balance) + '</span>' : '<span style="color:var(--success)">应退 ' + U.fmtMoney(-c.balance) + '</span>')) : '') +
        row('订单号', booking.id) +
        '</div>';
    }

    var foot = [];
    if (d.chip === 'RV' && can('reception.checkin')) foot.push({ text: '办理入住', cls: 'btn-primary', onClick: function (close) { close(); PMS.pages.reception.openCheckinModal(booking, refresh); } });
    if (d.chip === 'OC' && can('reception.checkout')) foot.push({ text: '退房结账', cls: 'btn-brass', onClick: function (close) { close(); PMS.pages.reception.openCheckoutModal(booking, refresh); } });
    if (d.chip === 'VD' && can('housekeeping.task')) foot.push({ text: '标记已清洁', cls: 'btn-primary', onClick: function (close) {
      var tk = PMS.api.getState().tasks.filter(function (x) { return x.roomNo === r.no && x.type === 'cleaning' && x.status !== 'done'; })[0];
      var done = function () { return tk ? api.updateTask(tk.id, { status: 'done' }) : api.createTask(r.no, 'cleaning', '快速清洁', '').then(function (nt) { return api.updateTask(nt.id, { status: 'done' }); }); };
      done().then(function () { PMS.ui.toast(r.no + ' 已完成清洁'); close(); refresh(); });
    } });
    if (d.chip === 'VD' && can('housekeeping.view') && !can('housekeeping.task')) foot.push({ text: '查看客房任务', cls: 'btn-ghost', onClick: function () { PMS.router.navigate('housekeeping'); } });
    if ((d.chip === 'OK' || d.chip === 'VD') && can('housekeeping.maint')) foot.push({ text: '停用维修', cls: 'btn-danger', onClick: function (close) { openOOModal(r, close, refresh); } });
    if (d.chip === 'OO' && can('housekeeping.maint')) foot.push({ text: '恢复使用', cls: 'btn-primary', onClick: function (close) {
      api.restoreRoom(r.no).then(function () { PMS.ui.toast(r.no + ' 已恢复，待清洁'); close(); refresh(); });
    } });

    PMS.ui.drawer({ title: '房间 ' + r.no, body: body, footer: foot.length ? foot : null });
    function refresh() { render(hostEl); }
  }

  function openOOModal(r, closeDrawer, refresh) {
    PMS.ui.modal({
      title: '停用房间 ' + r.no,
      body: PMS.ui.field('停用原因', '<textarea class="textarea" id="ooNote" placeholder="如：空调故障、水管漏水…"></textarea>', { req: true }),
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '确认停用', cls: 'btn-danger', onClick: function (close) {
          var note = U.qs('#ooNote').value.trim();
          if (!note) return PMS.ui.toast('请填写停用原因', 'err');
          PMS.api.setRoomOO(r.no, note).then(function () {
            PMS.ui.toast(r.no + ' 已停用');
            close(); closeDrawer(); refresh();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
        } }
      ]
    });
  }

  function row(k, v) { return '<div class="row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }
  function statusBadge(chip) {
    var m = { OK: ['空净', 'bg-green'], VD: ['空脏', 'bg-amber'], OC: ['在住', 'bg-blue'], OO: ['停用', 'bg-red'], RV: ['预抵', 'bg-violet'] };
    return '<span class="badge ' + m[chip][1] + '">' + m[chip][0] + '</span>';
  }

  PMS.pages.rooms = {
    key: 'rooms', title: '房态看板', perm: 'rooms.view', group: '前台',
    icon: ICON, render: render
  };
})();
