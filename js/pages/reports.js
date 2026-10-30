/* 云澜 PMS · 经营报表（手写 SVG 图表，无外部依赖） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>';

  function render(host) {
    document.title = '经营报表 · 云澜 PMS';
    var api = PMS.api;
    var s = api.getState();
    var stats = s.dailyStats;
    var last7 = stats.slice(-7);
    var avg = function (arr, k) {
      return arr.length ? Math.round(arr.reduce(function (sum, x) { return sum + x[k]; }, 0) / arr.length) : 0;
    };
    var d = api.dashboard();

    var cards = [
      { label: '近 7 天平均出租率', value: avg(last7, 'occ'), unit: '%' },
      { label: '近 7 天平均房价 ADR', value: '¥' + avg(last7, 'adr'), unit: '' },
      { label: '近 7 天平均 RevPAR', value: '¥' + avg(last7, 'revpar'), unit: '' },
      { label: '近 7 天房费总收入', value: U.fmtMoneyShort(last7.reduce(function (sum, x) { return sum + x.revenue; }, 0)), unit: '' }
    ];

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">经营报表</div></div>' +
        '<div class="page-sub">出租率 · 营收 · 渠道 · 房型分析（演示数据为近 14 天）</div>' +
      '</div>' +
      '<div class="grid grid-4" style="margin-bottom:16px">' +
        cards.map(function (c) {
          return '<div class="card card-pad stat-card"><div class="s-label">' + c.label + '</div>' +
            '<div class="s-value">' + c.value + (c.unit ? '<small>' + c.unit + '</small>' : '') + '</div></div>';
        }).join('') +
      '</div>' +
      '<div class="grid grid-2" style="margin-bottom:16px">' +
        '<div class="card card-pad"><div class="card-title">出租率趋势（14 天）</div>' + occChart(stats) + '</div>' +
        '<div class="card card-pad"><div class="card-title">房费收入（14 天）</div>' + revenueChart(stats) + '</div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="card card-pad"><div class="card-title">预订渠道构成（近 30 天订单）</div>' + sourceChart(s) + '</div>' +
        '<div class="card card-pad"><div class="card-title">房型出租情况（实时）</div>' + typeTable(s) + '</div>' +
      '</div>';
  }

  /* ---------- 折线图 ---------- */
  function occChart(stats) {
    var W = 500, H = 190, PL = 36, PB = 22;
    var pts = stats.map(function (s, i) {
      return {
        x: PL + i * (W - PL - 10) / (stats.length - 1),
        y: H - PB - (s.occ / 100) * (H - PB - 14),
        s: s
      };
    });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
    var area = line + ' L' + pts[pts.length - 1].x.toFixed(1) + ' ' + (H - PB) + ' L' + pts[0].x.toFixed(1) + ' ' + (H - PB) + ' Z';
    var gl = '';
    [0, 50, 100].forEach(function (v) {
      var y = H - PB - (v / 100) * (H - PB - 14);
      gl += '<line class="chart-grid-line" x1="' + PL + '" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '"/>' +
        '<text class="chart-axis" x="' + (PL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + v + '%</text>';
    });
    var labels = [0, 3, 6, 9, 13].map(function (i) {
      return pts[i] ? '<text class="chart-axis" x="' + pts[i].x + '" y="' + (H - 6) + '" text-anchor="middle">' + pts[i].s.date.slice(5) + '</text>' : '';
    }).join('');
    return '<div class="chart-box"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="出租率趋势图">' + gl +
      '<path class="chart-area" d="' + area + '"/><path class="chart-line" d="' + line + '"/>' +
      pts.map(function (p) {
        return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.6" fill="var(--pine)"><title>' + p.s.date + ' 出租率 ' + p.s.occ + '% · ' + p.s.roomsSold + ' 间夜</title></circle>';
      }).join('') + labels + '</svg></div>';
  }

  /* ---------- 柱状图 ---------- */
  function revenueChart(stats) {
    var W = 500, H = 190, PL = 52, PB = 22;
    var max = Math.max.apply(null, stats.map(function (s) { return s.revenue; })) * 1.1;
    var bw = (W - PL - 10) / stats.length * 0.55;
    var gap = (W - PL - 10) / stats.length;
    var bars = stats.map(function (s, i) {
      var h = (s.revenue / max) * (H - PB - 14);
      var x = PL + i * gap + (gap - bw) / 2;
      return '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + (H - PB - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + s.date + ' 收入 ' + U.fmtMoney(s.revenue) + '</title></rect>';
    }).join('');
    var gl = '';
    [0, 0.5, 1].forEach(function (v) {
      var y = H - PB - v * (H - PB - 14);
      gl += '<line class="chart-grid-line" x1="' + PL + '" y1="' + y + '" x2="' + (W - 10) + '" y2="' + y + '"/>' +
        '<text class="chart-axis" x="' + (PL - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + U.fmtMoneyShort(max * v / 1.1) + '</text>';
    });
    var labels = [0, 3, 6, 9, 13].map(function (i) {
      return stats[i] ? '<text class="chart-axis" x="' + (PL + i * gap + gap / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + stats[i].date.slice(5) + '</text>' : '';
    }).join('');
    return '<div class="chart-box"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="房费收入柱状图">' + gl + bars + labels + '</svg></div>';
  }

  /* ---------- 渠道构成（水平条） ---------- */
  function sourceChart(s) {
    var cutoff = U.addDays(U.today(), -30);
    var recent = s.bookings.filter(function (b) { return b.createdAt >= cutoff && b.status !== 'cancelled' && b.status !== 'noshow'; });
    var bySrc = {};
    s.sources.forEach(function (x) { bySrc[x.key] = { name: x.name, count: 0, revenue: 0 }; });
    recent.forEach(function (b) {
      if (bySrc[b.source]) {
        bySrc[b.source].count++;
        bySrc[b.source].revenue += b.price * b.nights;
      }
    });
    var rows = Object.keys(bySrc).map(function (k) { return bySrc[k]; }).filter(function (x) { return x.count > 0; });
    if (!rows.length) return PMS.ui.empty('近 30 天没有有效订单');
    var total = rows.reduce(function (sum, x) { return sum + x.count; }, 0);
    rows.sort(function (a, b) { return b.count - a.count; });
    var colors = ['var(--st-oc)', 'var(--brass)', 'var(--st-ok)', 'var(--st-rv)', 'var(--st-vd)', 'var(--pine)'];
    return rows.map(function (r, i) {
      var pct = Math.round(r.count / total * 100);
      return '<div style="margin-bottom:12px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">' +
        '<span>' + U.escapeHtml(r.name) + '</span>' +
        '<b class="num">' + r.count + ' 单 · ' + pct + '% · ' + U.fmtMoneyShort(r.revenue) + '</b></div>' +
        '<div style="height:10px;background:var(--paper);border-radius:5px;overflow:hidden">' +
        '<div style="height:100%;width:' + Math.max(pct, 2) + '%;background:' + colors[i % colors.length] + ';border-radius:5px"></div></div></div>';
    }).join('') + '<div class="form-hint">按订单创建时间统计近 30 天，含在住与已离店订单</div>';
  }

  /* ---------- 房型表 ---------- */
  function typeTable(s) {
    var T = U.today();
    var rows = s.roomTypes.map(function (t) {
      var rooms = s.rooms.filter(function (r) { return r.typeCode === t.code; });
      var oc = rooms.filter(function (r) { return r.status === 'OC'; }).length;
      var oo = rooms.filter(function (r) { return r.status === 'OO'; }).length;
      var sellable = rooms.length - oo;
      var occ = sellable > 0 ? Math.round(oc / sellable * 100) : 0;
      return '<tr><td class="strong">' + U.escapeHtml(t.name) + '</td>' +
        '<td class="num">' + rooms.length + '</td>' +
        '<td class="num">' + oc + '</td>' +
        '<td class="num">' + oo + '</td>' +
        '<td class="num"><b>' + occ + '%</b></td>' +
        '<td class="num">' + U.fmtMoney(t.basePrice) + '</td>' +
        '<td class="num">' + U.fmtMoneyShort(oc * t.basePrice) + '</td></tr>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>房型</th><th>房量</th><th>在住</th><th>停用</th><th>出租率</th><th>门市价</th><th>今日房费（估）</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="form-hint" style="margin-top:10px">今日房费按在住订单房价估算，不含杂项与已结账订单</div>';
  }

  PMS.pages.reports = {
    key: 'reports', title: '经营报表', perm: 'reports.view', group: '财务',
    icon: ICON, render: render
  };
})();
