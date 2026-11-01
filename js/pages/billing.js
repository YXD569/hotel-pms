/* 云澜 PMS · 账务中心 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>';

  var filters = { kw: '', status: '' };

  function render(host) {
    document.title = '账务中心 · 云澜 PMS';
    var s = PMS.api.getState();

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">账务中心</div></div>' +
        '<div class="page-sub">客账明细、收款与发票</div>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<div class="filter-bar">' +
          '<input class="input" id="fKw" placeholder="搜索账单号 / 客人 / 房间" style="width:230px" value="' + U.escapeHtml(filters.kw) + '">' +
          '<select class="select" id="fStatus">' +
            '<option value="">全部账单</option>' +
            '<option value="open"' + (filters.status === 'open' ? ' selected' : '') + '>未结账</option>' +
            '<option value="settled"' + (filters.status === 'settled' ? ' selected' : '') + '>已结账</option>' +
          '</select>' +
          '<span style="font-size:12px;color:var(--ink-3);margin-left:auto" id="fCount"></span>' +
        '</div>' +
        '<div id="foTable"></div>' +
      '</div>';

    var apply = function () {
      filters.kw = U.qs('#fKw').value.trim();
      filters.status = U.qs('#fStatus').value;
      renderTable();
    };
    U.qs('#fKw').addEventListener('input', apply);
    U.qs('#fStatus').addEventListener('change', apply);
    renderTable();

    function renderTable() {
      var list = PMS.api.getState().folios.filter(function (f) {
        if (filters.status && f.status !== filters.status) return false;
        if (filters.kw) {
          var kw = filters.kw.toLowerCase();
          if (f.id.toLowerCase().indexOf(kw) < 0 && f.guestName.indexOf(kw) < 0 && (f.roomNo || '').indexOf(kw) < 0) return false;
        }
        return true;
      });
      U.qs('#fCount').textContent = '共 ' + list.length + ' 张账单';
      if (!list.length) {
        U.qs('#foTable').innerHTML = PMS.ui.empty('没有符合条件的账单');
        return;
      }
      var cols = [
        { text: '账单号' }, { text: '房间' }, { text: '客人' }, { text: '房费' },
        { text: '杂项' }, { text: '已收' }, { text: '余额' }, { text: '状态' }, { text: '发票' }, { text: '操作' }
      ];
      var rows = list.map(function (f) {
        var c = PMS.api.folioComputed(f);
        return '<tr>' +
          '<td class="num" style="font-size:12px">' + f.id + '</td>' +
          '<td class="num strong">' + (f.roomNo || '—') + '</td>' +
          '<td class="strong">' + U.escapeHtml(f.guestName) + '</td>' +
          '<td class="num">' + U.fmtMoney(c.roomFee) + '</td>' +
          '<td class="num">' + U.fmtMoney(c.extrasTotal) + '</td>' +
          '<td class="num">' + U.fmtMoney(c.paid) + '</td>' +
          '<td class="num">' + (c.balance > 0 ? '<span style="color:var(--danger)">' + U.fmtMoney(c.balance) + '</span>' : (c.balance < 0 ? '<span style="color:var(--success)">' + U.fmtMoney(-c.balance) + ' 可退</span>' : '—')) + '</td>' +
          '<td>' + (f.status === 'open' ? PMS.ui.badge('未结账', 'bg-amber') : PMS.ui.badge('已结账', 'bg-green')) + '</td>' +
          '<td>' + (f.invoice ? PMS.ui.badge('已开票', 'bg-brass') : '<span style="color:var(--ink-3)">—</span>') + '</td>' +
          '<td><button class="btn-link" data-fid="' + f.id + '">账单明细</button></td></tr>';
      }).join('');
      U.qs('#foTable').innerHTML = PMS.ui.table(cols, rows);
      U.qsa('#foTable [data-fid]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var f = PMS.api.folioById(btn.getAttribute('data-fid'));
          if (f) openFolioDrawer(f, function () { render(host); });
        });
      });
    }
  }

  /* ---------- 账单明细抽屉 ---------- */
  function openFolioDrawer(f, done) {
    var can = PMS.auth.can.bind(PMS.auth);
    var api = PMS.api;

    function bodyHtml(f) {
      var b = api.bookingById(f.bookingId);
      var c = api.folioComputed(f);
      var extrasRows = f.extras.length ? f.extras.map(function (e) {
        return '<tr><td>' + U.escapeHtml(e.name) + '</td><td>' + U.escapeHtml(e.category || '') + '</td><td class="num">×' + e.qty + '</td>' +
          '<td class="num">' + U.fmtMoney(e.amount * e.qty) + '</td><td>' + (e.voided ? PMS.ui.badge('已作废', 'bg-grey') : '') + '</td>' +
          (can('billing.void') && f.status === 'open' && !e.voided ? '<td><button class="btn-link danger" data-void-ex="' + e.id + '">作废</button></td>' : '') +
          '</tr>';
      }).join('') : '<tr><td colspan="6" style="color:var(--ink-3)">无杂项消费</td></tr>';
      var payRows = f.payments.length ? f.payments.map(function (p) {
        return '<tr><td>' + (p.refund ? '押金退还' : U.escapeHtml(p.note || '收款')) + '</td><td>' + U.escapeHtml(p.method || '') + '</td>' +
          '<td class="num">' + U.fmtMoney(p.amount) + '</td><td class="num">' + p.time + '</td>' +
          (can('billing.void') && !p.voided && f.status === 'open' && !p.refund ? '<td><button class="btn-link danger" data-void-pay="' + p.id + '">作废</button></td>' : '') +
          '</tr>';
      }).join('') : '<tr><td colspan="5" style="color:var(--ink-3)">无收款记录</td></tr>';

      return '<div class="info-list" style="margin-bottom:14px">' +
        '<div class="row"><span class="k">账单号</span><span class="v num">' + f.id + '</span></div>' +
        '<div class="row"><span class="k">房间 / 客人</span><span class="v"><b class="num">' + (f.roomNo || '—') + '</b> · ' + U.escapeHtml(f.guestName) + '</span></div>' +
        (b ? '<div class="row"><span class="k">住离</span><span class="v num">' + b.arrive + ' ~ ' + b.depart + '（' + b.nights + ' 晚 × ' + U.fmtMoney(b.price) + '）</span></div>' : '') +
        '<div class="row"><span class="k">房费合计</span><span class="v num">' + U.fmtMoney(c.roomFee) + '</span></div>' +
        '<div class="row"><span class="k">杂项合计</span><span class="v num">' + U.fmtMoney(c.extrasTotal) + '</span></div>' +
        '<div class="row"><span class="k">应收总额</span><span class="v num"><b>' + U.fmtMoney(c.total) + '</b></span></div>' +
        '<div class="row"><span class="k">已收合计</span><span class="v num">' + U.fmtMoney(c.paid) + '</span></div>' +
        '<div class="row"><span class="k">余额</span><span class="v num">' + (c.balance > 0 ? '<b style="color:var(--danger)">' + U.fmtMoney(c.balance) + ' 待收</b>' : (c.balance < 0 ? '<b style="color:var(--success)">' + U.fmtMoney(-c.balance) + ' 应退</b>' : '已平')) + '</span></div>' +
        (f.status === 'settled' ? '<div class="row"><span class="k">结账时间</span><span class="v num">' + f.settledAt + '</span></div>' : '') +
        '</div>' +
        '<div class="card-title">杂项消费</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>项目</th><th>类别</th><th>数量</th><th>金额</th><th></th>' + (can('billing.void') && f.status === 'open' ? '<th></th>' : '') + '</tr></thead><tbody>' + extrasRows + '</tbody></table></div>' +
        '<div class="card-title" style="margin-top:14px">收退款记录</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>说明</th><th>方式</th><th>金额</th><th>时间</th>' + (can('billing.void') && f.status === 'open' ? '<th></th>' : '') + '</tr></thead><tbody>' + payRows + '</tbody></table></div>';
    }

    var foot = [];
    if (f.status === 'open') {
      if (can('billing.charge')) foot.push({ text: '杂项入账', cls: 'btn-ghost', onClick: function (close) { close(); openExtraModal(f, done); } });
      if (can('billing.pay')) foot.push({ text: '收款', cls: 'btn-primary', onClick: function (close) { close(); openPayModal(f, done); } });
    } else if (can('billing.void')) {
      foot.push({ text: f.invoice ? '标记未开票' : '标记已开票', cls: 'btn-ghost', onClick: function (close) {
        api.setInvoice(f.id, !f.invoice).then(function () {
          PMS.ui.toast(f.invoice ? '已标记未开票' : '已标记开票');
          close(); done();
        }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
      } });
    }

    var d = PMS.ui.drawer({
      title: '账单明细 · ' + f.id,
      body: bodyHtml(f),
      footer: foot.length ? foot : null
    });

    U.qsa('[data-void-ex]', d.el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemId = Number(btn.getAttribute('data-void-ex'));
        PMS.ui.confirmDialog('确定作废该消费条目吗？作废后不计入应收。', { danger: true, confirmText: '确认作废' }).then(function (yes) {
          if (!yes) return;
          api.voidExtra(f.id, itemId).then(function () {
            PMS.ui.toast('条目已作废');
            d.close(); done();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
        });
      });
    });
    U.qsa('[data-void-pay]', d.el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var itemId = Number(btn.getAttribute('data-void-pay'));
        PMS.ui.confirmDialog('确定作废该笔收款吗？作废后需重新收款。', { danger: true, confirmText: '确认作废' }).then(function (yes) {
          if (!yes) return;
          api.voidPayment(f.id, itemId).then(function () {
            PMS.ui.toast('收款已作废');
            d.close(); done();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
        });
      });
    });
  }

  /* ---------- 杂项入账 ---------- */
  function openExtraModal(f, done) {
    var body =
      '<div class="form-grid">' +
      PMS.ui.field('项目名称', '<input class="input" id="exName" placeholder="如：迷你吧·红酒">') +
      PMS.ui.field('类别', '<select class="select" id="exCat"><option>杂项</option><option>餐饮</option><option>赔偿</option></select>') +
      '</div>' +
      '<div class="form-grid">' +
      PMS.ui.field('数量', '<input class="input" id="exQty" type="number" min="1" value="1">') +
      PMS.ui.field('金额（元）', '<input class="input" id="exAmount" type="number" min="0" placeholder="0.00">') +
      '</div>';
    PMS.ui.modal({
      title: '杂项入账 · ' + f.roomNo + ' ' + f.guestName,
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
  }

  /* ---------- 收款 ---------- */
  function openPayModal(f, done) {
    var c = PMS.api.folioComputed(f);
    var body =
      '<div class="info-list" style="margin-bottom:14px">' +
      '<div class="row"><span class="k">当前余额</span><span class="v num"><b style="color:var(--danger)">' + U.fmtMoney(Math.max(c.balance, 0)) + '</b> 待收</span></div>' +
      '</div>' +
      '<div class="form-grid">' +
      PMS.ui.field('收款金额（元）', '<input class="input" id="payAmount" type="number" min="0" value="' + Math.max(c.balance, 0) + '">') +
      PMS.ui.field('收款方式', '<select class="select" id="payMethod"><option>现金</option><option>微信</option><option>支付宝</option><option>银行卡</option></select>') +
      '</div>' +
      PMS.ui.field('备注', '<input class="input" id="payNote" placeholder="如：预收半日房费">');
    PMS.ui.modal({
      title: '账房收款 · ' + f.roomNo + ' ' + f.guestName,
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '确认收款', cls: 'btn-primary', onClick: function (close, btn) {
          var amount = Number(U.qs('#payAmount').value);
          if (!(amount > 0)) return PMS.ui.toast('请填写有效金额', 'err');
          btn.disabled = true;
          PMS.api.addPayment(f.id, amount, U.qs('#payMethod').value, U.qs('#payNote').value.trim() || undefined)
            .then(function () { PMS.ui.toast('收款成功 ' + U.fmtMoney(amount)); close(); done(); })
            .catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  PMS.pages.billing = {
    key: 'billing', title: '账务中心', perm: 'billing.view', group: '财务',
    icon: ICON, render: render
  };
})();
