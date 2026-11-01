/* 云澜 PMS · 客房管理（清洁与维修任务看板） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M7 20V9l5-3 5 3v11"/><path d="M9 13h6M9 16h6"/></svg>';

  function render(host) {
    document.title = '客房管理 · 云澜 PMS';
    var can = PMS.auth.can.bind(PMS.auth);
    var s = PMS.api.getState();
    var tasks = s.tasks;

    var cols = [
      { key: 'pending', name: '待处理' },
      { key: 'doing', name: '进行中' },
      { key: 'done', name: '已完成' }
    ];

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">客房管理</div></div>' +
        '<div class="page-sub">清洁与维修任务的分派与跟进</div>' +
        '<div class="page-actions">' +
          (can('housekeeping.task') ? '<button class="btn btn-primary" id="btnNewTask">新建任务</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="board">' +
        cols.map(function (c) {
          var list = tasks.filter(function (t) { return t.status === c.key; });
          return '<div>' +
            '<div class="board-col-head">' + c.name + '<span class="cnt">' + list.length + '</span></div>' +
            '<div data-col="' + c.key + '">' +
            (list.length ? list.map(function (t) { return taskCardHtml(t); }).join('') : PMS.ui.empty('暂无任务')) +
            '</div></div>';
        }).join('') +
      '</div>';

    var newBtn = U.qs('#btnNewTask');
    if (newBtn) newBtn.addEventListener('click', function () { openNewTaskModal(function () { render(host); }); });

    U.qsa('[data-tact]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-tid');
        var act = btn.getAttribute('data-tact');
        var t = s.tasks.filter(function (x) { return x.id === id; })[0];
        if (!t) return;
        var p;
        if (act === 'start') p = PMS.api.updateTask(id, { status: 'doing', assignee: t.assignee || currentUserName() });
        else if (act === 'done') p = PMS.api.updateTask(id, { status: 'done', assignee: t.assignee || currentUserName() });
        else p = null;
        if (!p) return;
        p.then(function () {
          var msg = '任务已更新';
          if (act === 'done') {
            msg = t.type === 'cleaning'
              ? t.roomNo + ' 清洁完成，房间已恢复可售'
              : t.roomNo + ' 维修任务已完成（房间仍为停用状态，需手动恢复）';
          }
          PMS.ui.toast(msg);
          render(host);
        }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
      });
    });
  }

  function currentUserName() {
    var u = PMS.auth.current();
    return u ? u.name : '';
  }

  function taskCardHtml(t) {
    var s = PMS.api.getState();
    var r = s.rooms.filter(function (x) { return x.no === t.roomNo; })[0];
    var typeBadge = t.type === 'cleaning'
      ? '<span class="badge bg-amber">清洁</span>'
      : '<span class="badge bg-red">维修</span>';
    var acts = '';
    var can = PMS.auth.can.bind(PMS.auth);
    if (can('housekeeping.task')) {
      if (t.status === 'pending') acts += '<button class="btn btn-ghost btn-sm" data-tact="start" data-tid="' + t.id + '">开始</button>';
      if (t.status === 'doing') acts += '<button class="btn btn-primary btn-sm" data-tact="done" data-tid="' + t.id + '">完成</button>';
    }
    var hkStaff = s.staff.filter(function (x) { return x.role === 'housekeeping' && x.status === 'active'; });
    var assignSel = '';
    if (can('housekeeping.task') && t.status !== 'done') {
      assignSel = '<select class="select" style="padding:3px 8px;font-size:12px;margin-top:8px" data-tsel="' + t.id + '" aria-label="分派给">' +
        '<option value="">分派给…</option>' +
        hkStaff.map(function (x) {
          return '<option value="' + U.escapeHtml(x.name) + '"' + (t.assignee === x.name ? ' selected' : '') + '>' + U.escapeHtml(x.name) + '</option>';
        }).join('') + '</select>';
    }
    return '<div class="task-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<span class="t-room">' + t.roomNo + '</span>' + typeBadge + '</div>' +
      '<div class="t-meta">' +
      (r ? PMS.api.typeName(r.typeCode) + ' · ' : '') +
      (t.assignee ? '分派：' + U.escapeHtml(t.assignee) : '未分派') + ' · ' + t.createdAt +
      '</div>' +
      (t.note ? '<div style="font-size:12.5px;color:var(--ink-2);margin-bottom:8px">' + U.escapeHtml(t.note) + '</div>' : '') +
      (t.status === 'done' ? '<div style="font-size:12px;color:var(--success)">✓ 完成于 ' + (t.doneAt || '') + '</div>' : '') +
      '<div class="t-actions">' + acts + '</div>' + assignSel +
    '</div>';
  }

  function openNewTaskModal(done) {
    var s = PMS.api.getState();
    var rooms = s.rooms.filter(function (r) { return r.status !== 'OC'; });
    var hkStaff = s.staff.filter(function (x) { return x.role === 'housekeeping' && x.status === 'active'; });
    var body =
      '<div class="form-grid">' +
      PMS.ui.field('房间', '<select class="select" id="ntRoom">' +
        rooms.map(function (r) { return '<option value="' + r.no + '">' + r.no + '（' + PMS.api.ROOM_STATUS[r.status].label + ' · ' + PMS.api.typeName(r.typeCode) + '）</option>'; }).join('') +
        '</select>', { req: true }) +
      PMS.ui.field('任务类型', '<select class="select" id="ntType"><option value="cleaning">清洁</option><option value="maintenance">维修</option></select>') +
      '</div>' +
      PMS.ui.field('分派给', '<select class="select" id="ntAssignee"><option value="">暂不分派</option>' +
        hkStaff.map(function (x) { return '<option value="' + U.escapeHtml(x.name) + '">' + U.escapeHtml(x.name) + '</option>'; }).join('') + '</select>') +
      PMS.ui.field('备注', '<textarea class="textarea" id="ntNote" placeholder="如：客人要求加婴儿床…"></textarea>');

    PMS.ui.modal({
      title: '新建客房任务',
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: '创建任务', cls: 'btn-primary', onClick: function (close, btn) {
          btn.disabled = true;
          PMS.api.createTask(U.qs('#ntRoom').value, U.qs('#ntType').value, U.qs('#ntNote').value.trim(), U.qs('#ntAssignee').value)
            .then(function () { PMS.ui.toast('任务已创建'); close(); done(); })
            .catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  PMS.pages.housekeeping = {
    key: 'housekeeping', title: '客房管理', perm: 'housekeeping.view', group: '客房',
    icon: ICON, render: render
  };

  /* 分派下拉变更（事件委托在 render 后挂载） */
  document.addEventListener('change', function (e) {
    var sel = e.target;
    if (sel && sel.getAttribute && sel.getAttribute('data-tsel')) {
      PMS.api.updateTask(sel.getAttribute('data-tsel'), { assignee: sel.value }).then(function () {
        PMS.ui.toast(sel.value ? '已分派给 ' + sel.value : '已取消分派');
        PMS.router.render();
      }).catch(function (err) { PMS.ui.toast(err.message, 'err'); });
    }
  });
})();
