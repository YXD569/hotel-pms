/* 云澜 PMS · 前台接待（入住 / 退房） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M15 20l4-4M18 17l2 2"/></svg>';

  var currentTab = 'arrivals';

  function render(host) {
    document.title = '前台接待 · 云澜 PMS';
    var can = PMS.auth.can.bind(PMS.auth);
    var s = PMS.api.getState();
    var T = U.today();

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">前台接待</div></div>' +
        '<div class="page-sub">入住登记与退房结账</div>' +
      '</div>' +
      '<div class="tabs">' +
        '<button class="tab' + (currentTab === 'arrivals' ? ' active' : '') + '" data-tab="arrivals">今日预抵</button>' +
        '<button class="tab' + (currentTab === 'inhouse' ? ' active' : '') + '" data-tab="inhouse">在住名单</button>' +
      '</div>' +
      '<div class="card card-pad" id="rcHost"></div>';

    U.qsa('[data-tab]').forEach(function (t) {
      t.addEventListener('click', function () {
        currentTab = t.getAttribute('data-tab');
        render(host);
      });
    });

    if (currentTab === 'arrivals') renderArrivals();
    else renderInhouse();

    /* ---- 今日预抵（含过期未到） ---- */
    function renderArrivals() {
      var list = s.bookings.filter(function (b) {
        return b.status === 'confirmed' && b.arrive <= T;
      }).sort(function (a, b) { return a.arrive < b.arrive ? -1 : 1; });
      var host2 = U.qs('#rcHost');
      if (!list.length) {
        host2.innerHTML = PMS.ui.empty('今日没有待入住的预抵订单');
        return;
      }
      var cols = [
        { text: '订单号' }, { text: '客人' }, { text: '手机' }, { text: '房型' },
        { text: '入住 ~ 离店' }, { text: '房价' }, { text: '房间' }, { text: '渠道' }, { text: '状态' }, { text: '操作' }
      ];
      var rows = list.map(function (b) {
        var overdue = b.arrive < T;
        var acts = '';
        if (can('reception.checkin')) acts += '<button class="btn-link" data-act="checkin" data-id="' + b.id + '">办理入住</button>';
        if (can('bookings.cancel')) acts += '<button class="btn-link danger" data-act="noshow" data-id="' + b.id + '">未到店</button>';
        return '<tr' + (overdue ? ' style="background:var(--danger-tint)"' : '') + '>' +
          '<td class="num" style="font-size:12px">' + b.id + '</td>' +
          '<td class="strong">' + U.escapeHtml(b.guestName) + '</td>' +
          '<td class="num">' + b.phone + '</td>' +
          '<td>' + PMS.api.typeName(b.typeCode) + '</td>' +
          '<td class="num">' + b.arrive + ' ~ ' + b.depart + '</td>' +
          '<td class="num">' + U.fmtMoney(b.price) + '</td>' +
          '<td class="num">' + (b.roomNo ? '<b>' + b.roomNo + '</b>' : '<span class="badge bg-amber">未排房</span>') + '</td>' +
          '<td>' + PMS.api.sourceName(b.source) + '</td>' +
          '<td>' + (overdue ? PMS.ui.badge('超时未到', 'bg-red') : PMS.ui.badge('待入住', 'bg-blue')) + '</td>' +
          '<td style="white-space:nowrap">' + acts + '</td></tr>';
      }).join('');
      host2.innerHTML = PMS.ui.table(cols, rows) +
        (list.some(function (b) { return b.arrive < T; }) ? '<div class="form-hint" style="margin-top:10px;color:var(--danger)">红色底色行为预抵已过期仍未到店的订单</div>' : '');
      U.qsa('#rcHost [data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var b = PMS.api.bookingById(btn.getAttribute('data-id'));
          if (!b) return;
          if (btn.getAttribute('data-act') === 'checkin') openCheckinModal(b, function () { render(host); });
          else {
            PMS.ui.confirmDialog('确定将 <b>' + U.escapeHtml(b.guestName) + '</b> 标记为未到店吗？房间将被释放。', { danger: true, confirmText: '标记未到店' })
              .then(function (yes) {
                if (!yes) return;
                PMS.api.markNoshow(b.id).then(function () { PMS.ui.toast('已标记未到店'); render(host); })
                  .catch(function (e) { PMS.ui.toast(e.message, 'err'); });
              });
          }
        });
      });
    }

    /* ---- 在住名单 ---- */
    function renderInhouse() {
      var list = s.bookings.filter(function (b) { return b.status === 'checkedin'; })
        .sort(function (a, b) { return a.roomNo < b.roomNo ? -1 : 1; });
      var host2 = U.qs('#rcHost');
      if (!list.length) {
        host2.innerHTML = PMS.ui.empty('当前没有在住客人');
        return;
      }
      var cols = [
        { text: '房间' }, { text: '客人' }, { text: '手机' }, { text: '入住 ~ 预离' },
        { text: '已住' }, { text: '房价' }, { text: '账单余额' }, { text: '操作' }
      ];
      var rows = list.map(function (b) {
        var f = PMS.api.folioOfBooking(b.id);
        var c = f ? PMS.api.folioComputed(f) : null;
        var dueToday = b.depart === T;
        var acts = '';
        if (can('billing.charge')) acts += '<button class="btn-link" data-act="extra" data-id="' + b.id + '">客账加项</button>';
        if (can('reception.checkout')) acts += '<button class="btn-link" data-act="checkout" data-id="' + b.id + '">退房结账</button>';
        return '<tr' + (dueToday ? ' style="background:var(--warn-tint)"' : '') + '>' +
          '<td class="num strong">' + b.roomNo + '</td>' +
          '<td class="strong">' + U.escapeHtml(b.guestName) + '</td>' +
          '<td class="num">' + b.phone + '</td>' +
          '<td class="num">' + b.arrive + ' ~ ' + b.depart + '</td>' +
          '<td class="num">' + (c ? c.nightsSoFar : '-') + ' / ' + b.nights + ' 晚</td>' +
          '<td class="num">' + U.fmtMoney(b.price) + '</td>' +
          '<td class="num">' + (c ? (c.balance > 0 ? '<span style="color:var(--danger)">' + U.fmtMoney(c.balance) + '</span>' : (c.balance < 0 ? '<span style="color:var(--success)">' + U.fmtMoney(-c.balance) + ' 可退</span>' : '<span style="color:var(--success)">已平</span>')) : '-') + '</td>' +
          '<td style="white-space:nowrap">' + acts + '</td></tr>';
      }).join('');
      host2.innerHTML = PMS.ui.table(cols, rows) +
        '<div class="form-hint" style="margin-top:10px">黄色底色行今日预离；余额为负表示押金富余，退房时多退少补。</div>';
      U.qsa('#rcHost [data-act]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var b = PMS.api.bookingById(btn.getAttribute('data-id'));
          if (!b) return;
          if (btn.getAttribute('data-act') === 'checkout') openCheckoutModal(b, function () { render(host); });
          else openQuickExtraModal(b, function () { render(host); });
        });
      });
    }
  }

  /* ---------- 办理入住 ---------- */
  function openCheckinModal(b, done) {
    var allFree = PMS.api.freeRooms(b.typeCode, b.arrive, b.depart, b.id);
    // 空脏房必须先完成清洁才能入住，不进候选列表
    var ready = allFree.filter(function (r) { return r.status !== 'VD'; });
    var dirtyCount = allFree.length - ready.length;
    // 已排房优先锁定该房间；若该房间不可用（被占/停用/待清洁），退回全部可入住房间，
    // 避免原实现里 fallback 失效导致误报「没有可入住房间」
    var assigned = b.roomNo ? ready.filter(function (r) { return r.no === b.roomNo; }) : [];
    var free = assigned.length ? assigned : ready;

    var roomSel = free.length
      ? '<select class="select" id="ciRoom">' +
        free.map(function (r) { return '<option value="' + r.no + '"' + (b.roomNo === r.no ? ' selected' : '') + '>' + r.no + '</option>'; }).join('') +
        '</select>' +
        (dirtyCount ? '<div class="form-hint" style="color:var(--danger);margin-top:6px">另有 ' + dirtyCount + ' 间空脏房，需在客房管理完成清洁后才可安排入住。</div>' : '')
      : '<div class="form-hint" style="color:var(--danger)">该房型暂无可入住房间（空净房）' +
        (dirtyCount ? '：' + dirtyCount + ' 间空脏房待清洁' : '') + '，请先安排清洁或调整订单房型。</div>';

    var body =
      '<div class="info-list" style="margin-bottom:14px">' +
      '<div class="row"><span class="k">客人</span><span class="v">' + U.escapeHtml(b.guestName) + ' · ' + b.phone + '</span></div>' +
      '<div class="row"><span class="k">订单</span><span class="v num">' + b.arrive + ' ~ ' + b.depart + '（' + b.nights + ' 晚 · ' + PMS.api.typeName(b.typeCode) + '）</span></div>' +
      '</div>' +
      PMS.ui.field('入住房间', roomSel, { req: true }) +
      '<div class="form-grid">' +
      PMS.ui.field('押金（元）', '<input class="input" id="ciDeposit" type="number" min="0" value="' + (b.deposit || Math.max(b.price, 300)) + '">') +
      PMS.ui.field('收款方式', '<select class="select" id="ciMethod"><option>现金</option><option>微信</option><option>支付宝</option><option>银行卡</option></select>') +
      '</div>' +
      '<div class="form-hint">入住即开立客账，押金计入已收款，退房时多退少补。</div>';

    PMS.ui.modal({
      title: '办理入住 · ' + b.guestName,
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '确认入住', cls: 'btn-primary', onClick: function (close, btn) {
          if (!free.length) return;
          var roomNo = U.qs('#ciRoom').value;
          var deposit = Number(U.qs('#ciDeposit').value) || 0;
          btn.disabled = true;
          PMS.api.checkIn(b.id, roomNo, deposit, U.qs('#ciMethod').value).then(function () {
            PMS.ui.toast(b.guestName + ' 已入住 ' + roomNo);
            close(); done();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  /* ---------- 退房结账 ---------- */
  function openCheckoutModal(b, done) {
    var f = PMS.api.folioOfBooking(b.id);
    if (!f) return PMS.ui.toast('未找到关联账单', 'err');
    var c = PMS.api.folioComputed(f);
    var extrasRows = f.extras.length
      ? f.extras.map(function (e) {
          return '<tr><td>' + U.escapeHtml(e.name) + '</td><td>' + e.category + '</td><td class="num">×' + e.qty + '</td>' +
            '<td class="num">' + U.fmtMoney(e.amount * e.qty) + '</td><td>' + (e.voided ? PMS.ui.badge('已作废', 'bg-grey') : '') + '</td></tr>';
        }).join('')
      : '<tr><td colspan="5" style="color:var(--ink-3)">无杂项消费</td></tr>';
    var paysRows = f.payments.length
      ? f.payments.map(function (p) {
          return '<tr><td>' + (p.refund ? '押金退还' : (p.note || '收款')) + '</td><td>' + p.method + '</td>' +
            '<td class="num">' + U.fmtMoney(p.amount) + '</td><td class="num">' + p.time + '</td></tr>';
        }).join('')
      : '<tr><td colspan="4" style="color:var(--ink-3)">无收款记录</td></tr>';

    var body =
      '<div class="info-list" style="margin-bottom:14px">' +
      '<div class="row"><span class="k">房间 / 客人</span><span class="v"><b class="num">' + b.roomNo + '</b> · ' + U.escapeHtml(b.guestName) + '</span></div>' +
      '<div class="row"><span class="k">住离日期</span><span class="v num">' + b.arrive + ' ~ ' + b.depart + '（' + b.nights + ' 晚）</span></div>' +
      '</div>' +
      '<div class="card-title">房费</div>' +
      '<div class="info-list"><div class="row"><span class="k">' + b.nights + ' 晚 × ' + U.fmtMoney(b.price) + '</span>' +
      '<span class="v num" style="font-size:15px">' + U.fmtMoney(c.roomFee) + '</span></div></div>' +
      '<div class="card-title" style="margin-top:12px">杂项消费</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>项目</th><th>类别</th><th>数量</th><th>金额</th><th></th></tr></thead><tbody>' + extrasRows + '</tbody></table></div>' +
      '<div class="card-title" style="margin-top:12px">已收款</div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>说明</th><th>方式</th><th>金额</th><th>时间</th></tr></thead><tbody>' + paysRows + '</tbody></table></div>' +
      '<div style="margin-top:14px;padding:12px 16px;background:var(--paper);border-radius:var(--radius-sm);font-size:14px">' +
      '合计应收 <b class="num">' + U.fmtMoney(c.total) + '</b> · 已收 <b class="num">' + U.fmtMoney(c.paid) + '</b> · ' +
      (c.balance > 0
        ? '需补收 <b class="num" style="color:var(--danger);font-size:16px">' + U.fmtMoney(c.balance) + '</b>'
        : c.balance < 0
          ? '应退 <b class="num" style="color:var(--success);font-size:16px">' + U.fmtMoney(-c.balance) + '</b>'
          : '<b style="color:var(--success)">账目已平</b>') +
      '</div>' +
      (c.balance > 0
        ? PMS.ui.field('补收方式', '<select class="select" id="coMethod"><option>现金</option><option>微信</option><option>支付宝</option><option>银行卡</option></select>', { req: true })
        : '<div class="form-hint" style="margin-top:10px">确认后退房，系统自动退还多余押金并生成清洁任务。</div>');

    PMS.ui.modal({
      title: '退房结账 · ' + b.roomNo + ' ' + b.guestName,
      body: body,
      wide: true,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '确认退房', cls: 'btn-brass', onClick: function (close, btn) {
          btn.disabled = true;
          var method = U.qs('#coMethod') ? U.qs('#coMethod').value : '现金';
          PMS.api.checkOut(b.id, method).then(function (res) {
            PMS.ui.toast(b.guestName + ' 已退房，房间转待清洁');
            close(); done();
            /* 退房成功后展示结算摘要（已收按账单实际收款汇总，含负数退款） */
            var paidFinal = 0;
            res.folio.payments.forEach(function (p) { if (!p.voided) paidFinal += p.amount; });
            PMS.ui.modal({
              title: '结算完成',
              body: '<div class="info-list">' +
                '<div class="row"><span class="k">账单号</span><span class="v num">' + res.folio.id + '</span></div>' +
                '<div class="row"><span class="k">结算总额</span><span class="v num">' + U.fmtMoney(res.computed.total) + '</span></div>' +
                '<div class="row"><span class="k">已收合计</span><span class="v num">' + U.fmtMoney(paidFinal) + '</span></div>' +
                '<div class="row"><span class="k">余额</span><span class="v num">' + U.fmtMoney(res.computed.total - paidFinal) + '</span></div>' +
                '<div class="row"><span class="k">清洁任务</span><span class="v">已自动派发至客房部</span></div>' +
                '</div>',
              footer: [{ text: '知道了', cls: 'btn-primary' }]
            });
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  /* ---------- 快速加项 ---------- */
  function openQuickExtraModal(b, done) {
    var f = PMS.api.folioOfBooking(b.id);
    if (!f) return PMS.ui.toast('未找到关联账单', 'err');
    var PRESETS = [
      { name: '迷你吧·矿泉水', category: '杂项', amount: 10 },
      { name: '迷你吧·可乐', category: '杂项', amount: 15 },
      { name: '迷你吧·啤酒', category: '杂项', amount: 25 },
      { name: '客房送餐', category: '餐饮', amount: 68 },
      { name: '洗衣服务', category: '杂项', amount: 40 }
    ];
    var body =
      '<div class="form-hint" style="margin-bottom:12px">点击常用项目快速入账 ' + b.roomNo + ' · ' + U.escapeHtml(b.guestName) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">' +
      PRESETS.map(function (p, i) {
        return '<button type="button" class="btn btn-ghost btn-sm" data-preset="' + i + '">' + p.name + ' ¥' + p.amount + '</button>';
      }).join('') + '</div>' +
      '<div class="form-grid">' +
      PMS.ui.field('项目名称', '<input class="input" id="exName" placeholder="自定义项目">') +
      PMS.ui.field('类别', '<select class="select" id="exCat"><option>杂项</option><option>餐饮</option></select>') +
      '</div>' +
      '<div class="form-grid">' +
      PMS.ui.field('数量', '<input class="input" id="exQty" type="number" min="1" value="1">') +
      PMS.ui.field('金额（元）', '<input class="input" id="exAmount" type="number" min="0" placeholder="0.00">') +
      '</div>';

    var m = PMS.ui.modal({
      title: '客账加项',
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '入 账', cls: 'btn-primary', onClick: function (close, btn) {
          var name = U.qs('#exName').value.trim();
          var amount = Number(U.qs('#exAmount').value);
          if (!name) return PMS.ui.toast('请填写项目名称', 'err');
          if (!(amount > 0)) return PMS.ui.toast('请填写有效金额', 'err');
          btn.disabled = true;
          PMS.api.addExtra(f.id, { name: name, category: U.qs('#exCat').value, qty: Number(U.qs('#exQty').value) || 1, amount: amount })
            .then(function () { PMS.ui.toast('已入账：' + name); close(); done(); })
            .catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
    U.qsa('[data-preset]', m.el).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var p = PRESETS[Number(chip.getAttribute('data-preset'))];
        U.qs('#exName', m.el).value = p.name;
        U.qs('#exCat', m.el).value = p.category;
        U.qs('#exAmount', m.el).value = p.amount;
        U.qs('#exQty', m.el).value = 1;
      });
    });
  }

  PMS.pages.reception = {
    key: 'reception', title: '前台接待', perm: 'reception.view', group: '前台',
    icon: ICON, render: render,
    openCheckinModal: openCheckinModal,
    openCheckoutModal: openCheckoutModal
  };
})();
