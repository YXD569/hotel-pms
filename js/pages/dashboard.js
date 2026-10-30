/* 云澜 PMS · 经营总览 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils, api, auth;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>';

  function render(host) {
    api = PMS.api; auth = PMS.auth;
    document.title = '经营总览 · 云澜 PMS';
    var d = api.dashboard();
    var T = U.today();
    var st = PMS.auth.current();

    var stats = [
      { label: '今日出租率', value: d.occRate, unit: '%', foot: '在住 ' + d.oc + ' / ' + d.roomTotal + ' 间（停用 ' + d.oo + ' 间）', mark: d.occRate >= 80 ? 'var(--danger)' : 'var(--brass)' },
      { label: '今日预抵', value: d.arrivalsToday.length, unit: '单', foot: d.unassigned.length ? '其中 ' + d.unassigned.length + ' 单未排房' : '全部已排房', mark: 'var(--st-oc)' },
      { label: '今日离店', value: d.departuresToday.length, unit: '单', foot: '请提醒客人 12:00 前退房', mark: 'var(--st-vd)' },
      { label: '今日房费收入', value: U.fmtMoneyShort(d.revenueToday), unit: '', foot: '按在住订单房价预估，不含杂项', mark: 'var(--success)' },
      { label: '待处理客房任务', value: d.pendingTasks.length, unit: '项', foot: '空脏房间 ' + d.vd + ' 间', mark: 'var(--warn)' }
    ];

    host.innerHTML =
      '<div class="page-head"><div><div class="page-title">经营总览</div></div>' +
      '<div class="page-sub">' + U.fmtDateCn(T) + ' · ' + U.escapeHtml(api.getState().hotelName) + '</div></div>' +

      '<div class="grid grid-4" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">' +
        stats.map(function (s) {
          return '<div class="card stat-card"><div class="s-mark" style="background:' + s.mark + '"></div>' +
            '<div class="s-label">' + s.label + '</div>' +
            '<div class="s-value">' + s.value + (s.unit ? '<small>' + s.unit + '</small>' : '') + '</div>' +
            '<div class="s-foot">' + s.foot + '</div></div>';
        }).join('') +
      '</div>' +

      '<div class="grid grid-23">' +
        '<div>' +
          /* 今日预抵待办 */
          '<div class="card card-pad" style="margin-bottom:16px">' +
            '<div class="card-title">今日预抵待办</div>' + arrivalsHtml(d) +
          '</div>' +
          /* 房态速览 */
          '<div class="card card-pad">' +
            '<div class="card-title">房态速览</div>' + roomSummaryHtml(d) +
          '</div>' +
        '</div>' +
        '<div>' +
          /* 预警 */
          '<div class="card card-pad" style="margin-bottom:16px">' +
            '<div class="card-title">预警与提醒</div>' + alertsHtml(d) +
          '</div>' +
          /* 趋势 */
          '<div class="card card-pad">' +
            '<div class="card-title">近 14 天出租率</div>' + trendHtml(d.stats) +
          '</div>' +
        '</div>' +
      '</div>';

    wireActions();
  }

  function arrivalsHtml(d) {
    var list = d.arrivalsToday;
    if (!list.length) return PMS.ui.empty('今日没有预抵订单');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>客人</th><th>房型</th><th>房间</th><th>来源</th><th>操作</th></tr></thead><tbody>' +
      list.map(function (b) {
        return '<tr><td class="strong" style="white-space:nowrap">' + U.escapeHtml(b.guestName) + '</td>' +
          '<td>' + api.typeName(b.typeCode) + '</td>' +
          '<td>' + (b.roomNo ? '<b>' + b.roomNo + '</b>' : '<span class="badge bg-amber">未排房</span>') + '</td>' +
          '<td>' + api.sourceName(b.source) + '</td>' +
          '<td>' +
            (PMS.auth.can('bookings.assign') && !b.roomNo ? '<button class="btn-link" data-act="assign" data-id="' + b.id + '">排房</button>' : '') +
            (PMS.auth.can('reception.checkin') ? '<button class="btn-link" data-act="checkin" data-id="' + b.id + '">办理入住</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function roomSummaryHtml(d) {
    var rows = [
      { label: '在住', n: d.oc, color: 'var(--st-oc)' },
      { label: '空净（可售）', n: d.ok, color: 'var(--st-ok)' },
      { label: '空脏（待清洁）', n: d.vd, color: 'var(--st-vd)' },
      { label: '停用维修', n: d.oo, color: 'var(--st-oo)' }
    ];
    var total = d.roomTotal || 1;
    return rows.map(function (r) {
      var pct = Math.round(r.n / total * 100);
      return '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">' +
        '<span style="color:var(--ink-2)">' + r.label + '</span><b class="num">' + r.n + ' 间 · ' + pct + '%</b></div>' +
        '<div style="height:8px;background:var(--paper);border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + r.color + ';border-radius:4px"></div></div></div>';
    }).join('');
  }

  function alertsHtml(d) {
    var items = [];
    if (d.vd > 0) items.push({ cls: 'bg-amber', text: '有 ' + d.vd + ' 间空脏房待清洁，及时安排可恢复可售库存。' });
    if (d.arrivalsOverdue.length) items.push({ cls: 'bg-red', text: d.arrivalsOverdue.length + ' 单预抵已过期仍未到店，请确认是否保留。' });
    if (d.unassigned.length) items.push({ cls: 'bg-blue', text: d.unassigned.length + ' 单今日预抵未排房，建议提前锁定房间。' });
    if (d.oo > 0) items.push({ cls: 'bg-grey', text: d.oo + ' 间房间停用维修中，已从可售库存移除。' });
    var openBal = 0;
    d.openFolios.forEach(function (f) {
      var c = api.folioComputed(f);
      if (c.balance > 0) openBal++;
    });
    if (openBal > 0) items.push({ cls: 'bg-violet', text: openBal + ' 张在途账单余额为正，请在退房前补收。' });
    if (!items.length) items.push({ cls: 'bg-green', text: '一切正常，没有需要关注的预警。' });
    return items.map(function (it, idx) {
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;' + (idx < items.length - 1 ? 'border-bottom:1px dashed var(--line-soft);' : '') + '">' +
        '<span class="badge ' + it.cls + '" style="flex-shrink:0;margin-top:2px">●</span>' +
        '<span style="font-size:13px">' + it.text + '</span></div>';
    }).join('');
  }

  function trendHtml(stats) {
    var W = 460, H = 150, PL = 34, PB = 20;
    var pts = stats.map(function (s, i) {
      var x = PL + i * (W - PL - 10) / (stats.length - 1);
      var y = H - PB - (s.occ / 100) * (H - PB - 12);
      return { x: x, y: y, s: s };
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = line + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (H - PB) + ' L' + pts[0].x.toFixed(1) + ' ' + (H - PB) + ' Z';
    var labels = '';
    [0, 2, 4, 6].forEach(function (i) {
      if (pts[i]) labels += '<text class="chart-axis" x="' + pts[i].x + '" y="' + (H - 6) + '" text-anchor="middle">' + pts[i].s.date.slice(5) + '</text>';
    });
    var hl = '';
    [0, 50, 100].forEach(function (v) {
      var y = H - PB - (v / 100) * (H - PB - 12);
      hl += '<line class="chart-grid-line" x1="' + PL + '" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '"/>' +
        '<text class="chart-axis" x="' + (PL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '%</text>';
    });
    return '<div class="chart-box"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="近14天出租率折线图">' +
      hl + '<path class="chart-area" d="' + area + '"/><path class="chart-line" d="' + line + '"/>' +
      pts.map(function (p) { return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.6" fill="var(--pine)"><title>' + p.s.date + ' 出租率 ' + p.s.occ + '%</title></circle>'; }).join('') +
      labels + '</svg></div>';
  }

  /* ---------- 动作 ---------- */
  function wireActions() {
    U.qsa('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var b = api.bookingById(id);
        if (!b) return;
        if (btn.getAttribute('data-act') === 'assign') {
          PMS.pages.bookings.openAssignModal(b, function () { render(U.qs('#pageHost')); });
        } else if (btn.getAttribute('data-act') === 'checkin') {
          PMS.pages.reception.openCheckinModal(b, function () { render(U.qs('#pageHost')); });
        }
      });
    });
  }

  PMS.pages.dashboard = {
    key: 'dashboard', title: '经营总览', perm: 'dashboard.view', group: '总览',
    icon: ICON, render: render
  };
})();
