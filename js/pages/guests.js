/* 云澜 PMS · 客人档案 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

  var kw = '';

  function render(host) {
    document.title = '客人档案 · 云澜 PMS';
    var can = PMS.auth.can.bind(PMS.auth);

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">客人档案</div></div>' +
        '<div class="page-sub">住宿历史与客人偏好，服务好每一位回头客</div>' +
      '</div>' +
      '<div class="card card-pad">' +
        '<div class="filter-bar">' +
          '<input class="input" id="gKw" placeholder="搜索姓名 / 手机" style="width:220px" value="' + U.escapeHtml(kw) + '">' +
          '<span style="font-size:12px;color:var(--ink-3);margin-left:auto" id="gCount"></span>' +
        '</div>' +
        '<div id="gTable"></div>' +
      '</div>';

    U.qs('#gKw').addEventListener('input', function () {
      kw = U.qs('#gKw').value.trim();
      renderTable();
    });
    renderTable();

    function renderTable() {
      var list = PMS.api.getState().guests.filter(function (g) {
        if (!kw) return true;
        return g.name.indexOf(kw) >= 0 || g.phone.indexOf(kw) >= 0;
      }).sort(function (a, b) { return b.stays - a.stays || b.spend - a.spend; });
      U.qs('#gCount').textContent = '共 ' + list.length + ' 位客人';
      if (!list.length) {
        U.qs('#gTable').innerHTML = PMS.ui.empty('没有找到匹配的客人');
        return;
      }
      var cols = [
        { text: '姓名' }, { text: '手机' }, { text: '会员等级' }, { text: '住宿次数' },
        { text: '累计消费' }, { text: '标签' }, { text: '操作' }
      ];
      var vipCls = { '钻石': 'bg-violet', '金卡': 'bg-brass', '银卡': 'bg-grey', '普通': 'bg-grey' };
      var rows = list.map(function (g) {
        var tags = g.tags && g.tags.length
          ? g.tags.map(function (t) { return '<span class="badge bg-blue">' + U.escapeHtml(t) + '</span>'; }).join(' ')
          : '<span style="color:var(--ink-3)">—</span>';
        return '<tr>' +
          '<td class="strong">' + U.escapeHtml(g.name) + '</td>' +
          '<td class="num">' + g.phone + '</td>' +
          '<td>' + PMS.ui.badge(g.vip, vipCls[g.vip] || 'bg-grey') + '</td>' +
          '<td class="num">' + g.stays + ' 次</td>' +
          '<td class="num">' + U.fmtMoney(g.spend) + '</td>' +
          '<td>' + tags + '</td>' +
          '<td><button class="btn-link" data-gid="' + g.id + '">查看档案</button></td></tr>';
      }).join('');
      U.qs('#gTable').innerHTML = PMS.ui.table(cols, rows);
      U.qsa('#gTable [data-gid]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var g = PMS.api.getState().guests.filter(function (x) { return x.id === btn.getAttribute('data-gid'); })[0];
          if (g) openGuestDrawer(g, function () { render(host); });
        });
      });
    }
  }

  function openGuestDrawer(g, done) {
    var s = PMS.api.getState();
    var history = s.bookings.filter(function (b) { return b.phone === g.phone; })
      .sort(function (a, b) { return a.arrive < b.arrive ? 1 : -1; });
    var can = PMS.auth.can.bind(PMS.auth);
    var vipCls = { '钻石': 'bg-violet', '金卡': 'bg-brass', '银卡': 'bg-grey', '普通': 'bg-grey' };

    var body =
      '<div class="info-list" style="margin-bottom:16px">' +
      '<div class="row"><span class="k">姓名</span><span class="v"><b>' + U.escapeHtml(g.name) + '</b></span></div>' +
      '<div class="row"><span class="k">手机</span><span class="v num">' + g.phone + '</span></div>' +
      '<div class="row"><span class="k">证件</span><span class="v num">' + (g.idCardMasked || '—') + '</span></div>' +
      '<div class="row"><span class="k">会员等级</span><span class="v">' + PMS.ui.badge(g.vip, vipCls[g.vip] || 'bg-grey') + '</span></div>' +
      '<div class="row"><span class="k">住宿次数</span><span class="v num">' + g.stays + ' 次</span></div>' +
      '<div class="row"><span class="k">累计消费</span><span class="v num">' + U.fmtMoney(g.spend) + '</span></div>' +
      '<div class="row"><span class="k">标签</span><span class="v">' + (g.tags.length ? g.tags.map(function (t) { return '<span class="badge bg-blue">' + U.escapeHtml(t) + '</span>'; }).join(' ') : '—') + '</span></div>' +
      (g.notes ? '<div class="row"><span class="k">偏好备注</span><span class="v">' + U.escapeHtml(g.notes) + '</span></div>' : '') +
      '</div>' +
      '<div class="card-title">住宿历史</div>' +
      (history.length
        ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>房型</th><th>房间</th><th>状态</th></tr></thead><tbody>' +
          history.map(function (b) {
            var st = PMS.api.BK_STATUS[b.status];
            return '<tr><td class="num">' + b.arrive + ' ~ ' + b.depart + '</td><td>' + PMS.api.typeName(b.typeCode) + '</td>' +
              '<td class="num">' + (b.roomNo || '—') + '</td><td>' + PMS.ui.badge(st.label, st.cls) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : PMS.ui.empty('暂无住宿记录'));

    PMS.ui.drawer({
      title: '客人档案 · ' + g.name,
      body: body,
      footer: can('guests.edit')
        ? [{ text: '编辑档案', cls: 'btn-primary', onClick: function (close) { close(); openEditModal(g, done); } }]
        : null
    });
  }

  function openEditModal(g, done) {
    var VIPOPTS = ['普通', '银卡', '金卡', '钻石'];
    var body =
      '<div class="form-grid">' +
      PMS.ui.field('会员等级', '<select class="select" id="egVip">' + VIPOPTS.map(function (v) {
        return '<option' + (g.vip === v ? ' selected' : '') + '>' + v + '</option>';
      }).join('') + '</select>') +
      PMS.ui.field('标签（逗号分隔）', '<input class="input" id="egTags" value="' + U.escapeHtml(g.tags.join(', ')) + '" placeholder="如：常住客, 高楼层">') +
      '</div>' +
      PMS.ui.field('偏好备注', '<textarea class="textarea" id="egNotes" placeholder="记录客人偏好，服务时提醒同事">' + U.escapeHtml(g.notes || '') + '</textarea>');

    PMS.ui.modal({
      title: '编辑档案 · ' + g.name,
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '保存', cls: 'btn-primary', onClick: function (close, btn) {
          btn.disabled = true;
          PMS.api.updateGuest(g.id, {
            vip: U.qs('#egVip').value,
            tags: U.qs('#egTags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean),
            notes: U.qs('#egNotes').value.trim()
          }).then(function () {
            PMS.ui.toast('档案已更新');
            close(); done();
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  PMS.pages.guests = {
    key: 'guests', title: '客人档案', perm: 'guests.view', group: '前台',
    icon: ICON, render: render
  };
})();
