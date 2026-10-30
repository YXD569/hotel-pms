/* 云澜 PMS · 预订管理 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  var filters = { kw: '', status: '', source: '' };

  function render(host) {
    document.title = '预订管理 · 云澜 PMS';
    var s = PMS.api.getState();
    var can = PMS.auth.can.bind(PMS.auth);

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">预订管理</div></div>' +
        '<div class="page-sub">散客、团队与渠道订单的统一管理</div>' +
        '<div class="page-actions">' +
          (can('bookings.create') ? '<button class="btn btn-primary" id="btnNewBk">新建预订</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<div class="filter-bar">' +
          '<input class="input" id="fKw" placeholder="搜索姓名 / 手机 / 订单号" style="width:220px" value="' + U.escapeHtml(filters.kw) + '">' +
          '<select class="select" id="fStatus">' +
            '<option value="">全部状态</option>' +
            Object.keys(PMS.api.BK_STATUS).map(function (k) {
              return '<option value="' + k + '"' + (filters.status === k ? ' selected' : '') + '>' + PMS.api.BK_STATUS[k].label + '</option>';
            }).join('') +
          '</select>' +
          '<select class="select" id="fSource">' +
            '<option value="">全部渠道</option>' +
            s.sources.map(function (x) {
              return '<option value="' + x.key + '"' + (filters.source === x.key ? ' selected' : '') + '>' + x.name + '</option>';
            }).join('') +
          '</select>' +
          '<span style="font-size:12px;color:var(--ink-3);margin-left:auto" id="bkCount"></span>' +
        '</div>' +
        '<div id="bkTable"></div>' +
      '</div>';

    var apply = function () {
      filters.kw = U.qs('#fKw').value.trim();
      filters.status = U.qs('#fStatus').value;
      filters.source = U.qs('#fSource').value;
      renderTable();
    };
    U.qs('#fKw').addEventListener('input', apply);
    U.qs('#fStatus').addEventListener('change', apply);
    U.qs('#fSource').addEventListener('change', apply);
    var newBtn = U.qs('#btnNewBk');
    if (newBtn) newBtn.addEventListener('click', function () {
      openBookingModal(null, function () { render(host); });
    });

    renderTable();

    function renderTable() {
      var list = PMS.api.getState().bookings.filter(function (b) {
        if (filters.status && b.status !== filters.status) return false;
        if (filters.source && b.source !== filters.source) return false;
        if (filters.kw) {
          var kw = filters.kw.toLowerCase();
          if (b.guestName.toLowerCase().indexOf(kw) < 0 && b.phone.indexOf(kw) < 0 && b.id.toLowerCase().indexOf(kw) < 0) return false;
        }
        return true;
      });
      U.qs('#bkCount').textContent = '共 ' + list.length + ' 单';
      if (!list.length) {
        U.qs('#bkTable').innerHTML = PMS.ui.empty('没有符合条件的订单');
        return;
      }
      var cols = [
        { text: '订单号' }, { text: '客人' }, { text: '手机' }, { text: '房型' },
        { text: '入住' }, { text: '离店' }, { text: '晚' }, { text: '房价' },
        { text: '房间' }, { text: '来源' }, { text: '状态' }, { text: '操作' }
      ];
      var rows = list.map(function (b) {
        var st = PMS.api.BK_STATUS[b.status];
        var acts = [];
        if (b.status === 'confirmed') {
          if (can('bookings.assign') && !b.roomNo) acts.push('<button class="btn-link" data-act="assign" data-id="' + b.id + '">排房</button>');
          if (can('bookings.edit')) acts.push('<button class="btn-link" data-act="edit" data-id="' + b.id + '">修改</button>');
          if (can('reception.checkin')) acts.push('<button class="btn-link" data-act="checkin" data-id="' + b.id + '">入住</button>');
          if (can('bookings.cancel')) acts.push('<button class="btn-link danger" data-act="cancel" data-id="' + b.id + '">取消</button>');
        } else if (b.status === 'checkedin') {
          acts.push('<button class="btn-link" data-act="detail" data-id="' + b.id + '">在住详情</button>');
        } else {
          acts.push('<button class="btn-link" data-act="detail" data-id="' + b.id + '">详情</button>');
        }
        return '<tr>' +
          '<td class="num" style="font-size:12px">' + b.id + '</td>' +
          '<td class="strong">' + U.escapeHtml(b.guestName) + '</td>' +
          '<td class="num">' + b.phone + '</td>' +
          '<td>' + PMS.api.typeName(b.typeCode) + '</td>' +
          '<td class="num">' + b.arrive + '</td>' +
          '<td class="num">' + b.depart + '</td>' +
          '<td class="num">' + b.nights + '</td>' +
          '<td class="num">' + U.fmtMoney(b.price) + '</td>' +
          '<td class="num">' + (b.roomNo || '<span style="color:var(--ink-3)">—</span>') + '</td>' +
          '<td>' + PMS.api.sourceName(b.source) + '</td>' +
          '<td>' + PMS.ui.badge(st.label, st.cls) + '</td>' +
          '<td style="white-space:nowrap">' + acts.join('') + '</td></tr>';
      }).join('');
      U.qs('#bkTable').innerHTML = PMS.ui.table(cols, rows);

      U.qsa('#bkTable [data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var b = PMS.api.bookingById(btn.getAttribute('data-id'));
          if (!b) return;
          var act = btn.getAttribute('data-act');
          if (act === 'assign') openAssignModal(b, function () { render(host); });
          else if (act === 'edit') openBookingModal(b, function () { render(host); });
          else if (act === 'checkin') PMS.pages.reception.openCheckinModal(b, function () { render(host); });
          else if (act === 'cancel') {
            PMS.ui.confirmDialog('确定取消 <b>' + U.escapeHtml(b.guestName) + '</b> 的预订（' + b.arrive + ' ~ ' + b.depart + '）吗？', { danger: true, confirmText: '确认取消' })
              .then(function (yes) {
                if (!yes) return;
                PMS.api.cancelBooking(b.id).then(function () {
                  PMS.ui.toast('订单已取消');
                  render(host);
                }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
              });
          } else if (act === 'detail') openDetailDrawer(b);
        });
      });
    }
  }

  /* ---------- 详情抽屉 ---------- */
  function openDetailDrawer(b) {
    var s = PMS.api.getState();
    var g = s.guests.filter(function (x) { return x.phone === b.phone; })[0];
    var body = '<div class="info-list">' +
      '<div class="row"><span class="k">订单号</span><span class="v num">' + b.id + '</span></div>' +
      '<div class="row"><span class="k">状态</span><span class="v">' + PMS.ui.badge(PMS.api.BK_STATUS[b.status].label, PMS.api.BK_STATUS[b.status].cls) + '</span></div>' +
      '<div class="row"><span class="k">客人</span><span class="v">' + U.escapeHtml(b.guestName) + (g ? '（' + g.vip + '）' : '') + '</span></div>' +
      '<div class="row"><span class="k">手机</span><span class="v num">' + b.phone + '</span></div>' +
      '<div class="row"><span class="k">房型</span><span class="v">' + PMS.api.typeName(b.typeCode) + '</span></div>' +
      '<div class="row"><span class="k">日期</span><span class="v num">' + b.arrive + ' ~ ' + b.depart + '（' + b.nights + ' 晚）</span></div>' +
      '<div class="row"><span class="k">房价</span><span class="v num">' + U.fmtMoney(b.price) + ' / 晚</span></div>' +
      '<div class="row"><span class="k">房间</span><span class="v num">' + (b.roomNo || '未排房') + '</span></div>' +
      '<div class="row"><span class="k">来源</span><span class="v">' + PMS.api.sourceName(b.source) + '</span></div>' +
      '<div class="row"><span class="k">预订时间</span><span class="v num">' + b.createdAt + '</span></div>' +
      (b.memo ? '<div class="row"><span class="k">备注</span><span class="v">' + U.escapeHtml(b.memo) + '</span></div>' : '') +
    '</div>';
    PMS.ui.drawer({ title: '订单详情', body: body });
  }

  /* ---------- 新建 / 修改预订 ---------- */
  function openBookingModal(b, done) {
    var s = PMS.api.getState();
    var isEdit = !!b;
    var T = U.today();
    var init = isEdit ? b : {
      guestName: '', phone: '', typeCode: s.roomTypes[0].code, source: 'walkin',
      arrive: T, depart: U.addDays(T, 1), price: s.roomTypes[0].basePrice,
      deposit: 0, roomNo: '', memo: ''
    };

    var typeOpts = s.roomTypes.map(function (t) {
      return '<option value="' + t.code + '"' + (init.typeCode === t.code ? ' selected' : '') + '>' + t.name + ' · ¥' + t.basePrice + '</option>';
    }).join('');
    var srcOpts = s.sources.map(function (x) {
      return '<option value="' + x.key + '"' + (init.source === x.key ? ' selected' : '') + '>' + x.name + '</option>';
    }).join('');

    var body =
      '<div class="form-grid">' +
        field('客人姓名', '<input class="input" id="bkName" value="' + U.escapeHtml(init.guestName) + '" placeholder="与证件一致">', { req: true }) +
        field('手机号', '<input class="input" id="bkPhone" value="' + U.escapeHtml(init.phone) + '" maxlength="11" placeholder="11 位手机号">', { req: true }) +
      '</div>' +
      '<div class="form-grid">' +
        field('渠道来源', '<select class="select" id="bkSource">' + srcOpts + '</select>') +
        field('房型', '<select class="select" id="bkType">' + typeOpts + '</select>', { req: true }) +
      '</div>' +
      '<div class="form-grid">' +
        field('入住日期', '<input class="input" type="date" id="bkArrive" value="' + init.arrive + '" min="' + T + '">', { req: true }) +
        field('离店日期', '<input class="input" type="date" id="bkDepart" value="' + init.depart + '" min="' + U.addDays(T, 1) + '">', { req: true }) +
      '</div>' +
      '<div class="form-grid">' +
        field('房价（元/晚）', '<input class="input" id="bkPrice" type="number" min="1" value="' + init.price + '">', { req: true }) +
        field('预收押金（元）', '<input class="input" id="bkDeposit" type="number" min="0" value="' + (init.deposit || 0) + '">') +
      '</div>' +
      field('指定房间（可不选）', '<select class="select" id="bkRoom"><option value="">由系统在办理入住时安排</option></select>', {
        hint: '仅列出所选房型在日期段内空闲、且未停用的房间'
      }) +
      field('备注', '<textarea class="textarea" id="bkMemo" placeholder="客人偏好、特殊要求…">' + U.escapeHtml(init.memo || '') + '</textarea>') +
      '<div class="form-hint" id="bkAvail" style="margin-top:-6px"></div>';

    var m = PMS.ui.modal({
      title: isEdit ? '修改预订 ' + b.id : '新建预订',
      body: body,
      wide: true,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: isEdit ? '保存修改' : '创建预订', cls: 'btn-primary', onClick: function (close, btn) { submit(close, btn); } }
      ]
    });

    function readForm() {
      return {
        guestName: U.qs('#bkName').value.trim(),
        phone: U.qs('#bkPhone').value.trim(),
        typeCode: U.qs('#bkType').value,
        source: U.qs('#bkSource').value,
        arrive: U.qs('#bkArrive').value,
        depart: U.qs('#bkDepart').value,
        price: Number(U.qs('#bkPrice').value),
        deposit: Number(U.qs('#bkDeposit').value) || 0,
        roomNo: U.qs('#bkRoom').value || null,
        memo: U.qs('#bkMemo').value.trim()
      };
    }

    function refreshRoomOptions() {
      var d = readForm();
      var sel = U.qs('#bkRoom');
      var keep = sel.value;
      if (!d.arrive || !d.depart || d.depart <= d.arrive) {
        U.qs('#bkAvail').textContent = '';
        sel.innerHTML = '<option value="">由系统在办理入住时安排</option>';
        return;
      }
      var av = PMS.api.availability(d.typeCode, d.arrive, d.depart, isEdit ? b.id : null);
      var free = PMS.api.freeRooms(d.typeCode, d.arrive, d.depart, isEdit ? b.id : null);
      if (isEdit && b.roomNo && b.status === 'confirmed' && free.every(function (r) { return r.no !== b.roomNo; })) {
        free.unshift({ no: b.roomNo }); /* 保留当前已排房间 */
      }
      sel.innerHTML = '<option value="">由系统在办理入住时安排</option>' +
        free.map(function (r) { return '<option value="' + r.no + '">' + r.no + '</option>'; }).join('');
      sel.value = keep;
      U.qs('#bkAvail').innerHTML = '该日期段 ' + U.escapeHtml(PMS.api.typeName(d.typeCode)) +
        '：可售 <b style="color:' + (av.available > 0 ? 'var(--success)' : 'var(--danger)') + '">' + av.available + '</b> / ' + av.total + ' 间' +
        (av.available <= 0 ? '，已满房' : '');
    }

    ['bkType', 'bkArrive', 'bkDepart'].forEach(function (id) {
      U.qs('#' + id).addEventListener('change', function () {
        if (id === 'bkType') {
          var t = PMS.api.typeByCode(U.qs('#bkType').value);
          U.qs('#bkPrice').value = t ? t.basePrice : '';
        }
        if (id === 'bkArrive') {
          var dep = U.qs('#bkDepart');
          if (dep.value <= U.qs('#bkArrive').value) dep.value = U.addDays(U.qs('#bkArrive').value, 1);
        }
        refreshRoomOptions();
      });
    });
    refreshRoomOptions();
    if (isEdit && b.roomNo) U.qs('#bkRoom').value = b.roomNo;

    function submit(close, btn) {
      var d = readForm();
      btn.disabled = true;
      var p = isEdit ? PMS.api.updateBooking(b.id, d) : PMS.api.createBooking(d);
      p.then(function () {
        PMS.ui.toast(isEdit ? '订单已更新' : '预订已创建：' + d.guestName + ' ' + d.arrive);
        close(); done();
      }).catch(function (e) {
        PMS.ui.toast(e.message, 'err');
        btn.disabled = false;
      });
    }
  }

  function field(label, inner, opts) { return PMS.ui.field(label, inner, opts); }

  /* ---------- 排房 ---------- */
  function openAssignModal(b, done) {
    var free = PMS.api.freeRooms(b.typeCode, b.arrive, b.depart, b.id);
    var body = '<div class="info-list" style="margin-bottom:14px">' +
      '<div class="row"><span class="k">客人</span><span class="v">' + U.escapeHtml(b.guestName) + '</span></div>' +
      '<div class="row"><span class="k">日期</span><span class="v num">' + b.arrive + ' ~ ' + b.depart + '</span></div>' +
      '<div class="row"><span class="k">房型</span><span class="v">' + PMS.api.typeName(b.typeCode) + '</span></div>' +
    '</div>' +
    PMS.ui.field('选择房间',
      free.length
        ? '<select class="select" id="asRoom">' + free.map(function (r) { return '<option value="' + r.no + '">' + r.no + '</option>'; }).join('') + '</select>'
        : '<div class="form-hint" style="color:var(--danger)">该日期段无空闲房间，请调整订单或先处理在住</div>',
      { req: true, hint: '共 ' + free.length + ' 间可选' });

    PMS.ui.modal({
      title: '为订单排房',
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '确认排房', cls: 'btn-primary', onClick: function (close, btn) {
          if (!free.length) return;
          btn.disabled = true;
          PMS.api.assignRoom(b.id, U.qs('#asRoom').value).then(function () {
            PMS.ui.toast('已排房 ' + U.qs('#asRoom').value);
            close(); done();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  PMS.pages.bookings = {
    key: 'bookings', title: '预订管理', perm: 'bookings.view', group: '前台',
    icon: ICON, render: render,
    openAssignModal: openAssignModal,
    openBookingModal: openBookingModal
  };
})();
