/* 云澜 PMS · 系统设置（员工 / 房型 / 数据） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  var currentTab = 'staff';

  function render(host) {
    document.title = '系统设置 · 云澜 PMS';
    var canManage = PMS.auth.can('settings.manage');

    host.innerHTML =
      '<div class="page-head">' +
        '<div><div class="page-title">系统设置</div></div>' +
        '<div class="page-sub">' + (canManage ? '员工账号、房型价格与演示数据管理' : '您拥有查看权限，修改需系统管理员') + '</div>' +
      '</div>' +
      '<div class="tabs">' +
        '<button class="tab' + (currentTab === 'staff' ? ' active' : '') + '" data-tab="staff">员工管理</button>' +
        '<button class="tab' + (currentTab === 'type' ? ' active' : '') + '" data-tab="type">房型与价格</button>' +
        '<button class="tab' + (currentTab === 'data' ? ' active' : '') + '" data-tab="data">数据管理</button>' +
      '</div>' +
      '<div id="setBody"></div>';

    U.qsa('[data-tab]').forEach(function (t) {
      t.addEventListener('click', function () {
        currentTab = t.getAttribute('data-tab');
        render(host);
      });
    });

    if (currentTab === 'staff') renderStaff();
    else if (currentTab === 'type') renderTypes();
    else renderData();
  }

  /* ---------- 员工管理 ---------- */
  function renderStaff() {
    var s = PMS.api.getState();
    var canManage = PMS.auth.can('settings.manage');
    var me = PMS.auth.current();
    var body = U.qs('#setBody');
    var cols = [
      { text: '工号' }, { text: '姓名' }, { text: '账号' }, { text: '角色' },
      { text: '手机' }, { text: '状态' }, { text: '操作' }
    ];
    var rows = s.staff.map(function (x) {
      var role = PMS.auth.ROLES[x.role] || { name: x.role };
      var acts = '';
      if (canManage) {
        acts += '<button class="btn-link" data-edit="' + x.id + '">编辑</button>';
        if (x.account !== me.account) {
          acts += x.status === 'active'
            ? '<button class="btn-link danger" data-toggle="' + x.id + '">停用</button>'
            : '<button class="btn-link" data-toggle="' + x.id + '">启用</button>';
        }
      }
      return '<tr' + (x.status !== 'active' ? ' style="opacity:.55"' : '') + '>' +
        '<td class="num" style="font-size:12px">' + x.id + '</td>' +
        '<td class="strong">' + U.escapeHtml(x.name) + '</td>' +
        '<td class="num">' + U.escapeHtml(x.account) + '</td>' +
        '<td>' + PMS.ui.badge(role.name, x.role === 'manager' ? 'bg-brass' : 'bg-blue') + '</td>' +
        '<td class="num">' + x.phone + '</td>' +
        '<td>' + (x.status === 'active' ? PMS.ui.badge('在职', 'bg-green') : PMS.ui.badge('已停用', 'bg-grey')) + '</td>' +
        '<td style="white-space:nowrap">' + acts + '</td></tr>';
    }).join('');

    body.innerHTML =
      '<div class="card card-pad">' +
      '<div class="filter-bar">' +
      '<span style="font-size:12px;color:var(--ink-3)">角色决定可见模块与操作权限，详见 README 权限矩阵</span>' +
      (canManage ? '<button class="btn btn-primary" id="btnAddStaff" style="margin-left:auto">新增员工</button>' : '') +
      '</div>' +
      PMS.ui.table(cols, rows) + '</div>';

    var addBtn = U.qs('#btnAddStaff');
    if (addBtn) addBtn.addEventListener('click', function () { openStaffModal(null); });
    U.qsa('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = s.staff.filter(function (y) { return y.id === b.getAttribute('data-edit'); })[0];
        if (x) openStaffModal(x);
      });
    });
    U.qsa('[data-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var x = s.staff.filter(function (y) { return y.id === b.getAttribute('data-toggle'); })[0];
        if (!x) return;
        var disabling = x.status === 'active';
        PMS.ui.confirmDialog('确定' + (disabling ? '停用' : '启用') + '账号 <b>' + U.escapeHtml(x.name) + '（' + U.escapeHtml(x.account) + '）</b>吗？' + (disabling ? '停用后该员工将无法登录。' : ''), { danger: disabling, confirmText: disabling ? '确认停用' : '确认启用' })
          .then(function (yes) {
            if (!yes) return;
            PMS.api.toggleStaff(x.id).then(function () {
              PMS.ui.toast('账号已' + (disabling ? '停用' : '启用'));
              render(U.qs('#pageHost'));
            }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
          });
      });
    });
  }

  function openStaffModal(x) {
    var isEdit = !!x;
    var roles = Object.keys(PMS.auth.ROLES);
    var body =
      '<div class="form-grid">' +
      PMS.ui.field('姓名', '<input class="input" id="stName" value="' + U.escapeHtml(x ? x.name : '') + '">', { req: true }) +
      PMS.ui.field('登录账号', '<input class="input" id="stAccount" value="' + U.escapeHtml(x ? x.account : '') + '" placeholder="英文账号"' + (isEdit ? ' disabled' : '') + '>', { req: true }) +
      '</div>' +
      '<div class="form-grid">' +
      PMS.ui.field('角色', '<select class="select" id="stRole">' +
        roles.map(function (r) {
          return '<option value="' + r + '"' + (x && x.role === r ? ' selected' : '') + '>' + PMS.auth.ROLES[r].name + ' — ' + PMS.auth.ROLES[r].desc + '</option>';
        }).join('') + '</select>', { req: true }) +
      PMS.ui.field('手机号', '<input class="input" id="stPhone" value="' + U.escapeHtml(x ? x.phone : '') + '">') +
      '</div>' +
      (isEdit
        ? PMS.ui.field('重置密码', '<input class="input" id="stPwd" type="password" placeholder="留空则不修改">')
        : PMS.ui.field('初始密码', '<input class="input" id="stPwd" type="password" placeholder="默认 123456">'));
    PMS.ui.modal({
      title: isEdit ? '编辑员工 · ' + x.name : '新增员工',
      body: body,
      footer: [
        { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
        { text: isEdit ? '保存' : '创建账号', cls: 'btn-primary', onClick: function (close, btn) {
          var name = U.qs('#stName').value.trim();
          var account = isEdit ? x.account : U.qs('#stAccount').value.trim();
          var pwd = U.qs('#stPwd').value;
          if (!name) return PMS.ui.toast('请填写姓名', 'err');
          if (!account) return PMS.ui.toast('请填写账号', 'err');
          var data = { name: name, account: account, role: U.qs('#stRole').value, phone: U.qs('#stPhone').value.trim(), password: pwd || undefined };
          if (isEdit) data.id = x.id;
          btn.disabled = true;
          PMS.api.upsertStaff(data).then(function () {
            PMS.ui.toast(isEdit ? '员工信息已更新' : '账号已创建');
            close(); render(U.qs('#pageHost'));
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
        } }
      ]
    });
  }

  /* ---------- 房型与价格 ---------- */
  function renderTypes() {
    var s = PMS.api.getState();
    var canManage = PMS.auth.can('settings.manage');
    var cols = [
      { text: '房型代码' }, { text: '房型名称' }, { text: '门市价（元/晚）' },
      { text: '可住人数' }, { text: '面积（㎡）' }, { text: '房量' }, { text: '操作' }
    ];
    var rows = s.roomTypes.map(function (t) {
      var count = s.rooms.filter(function (r) { return r.typeCode === t.code; }).length;
      return '<tr><td class="num">' + t.code + '</td>' +
        '<td class="strong">' + U.escapeHtml(t.name) + '</td>' +
        '<td class="num">' + U.fmtMoney(t.basePrice) + '</td>' +
        '<td class="num">' + t.capacity + ' 人</td>' +
        '<td class="num">' + t.size + '</td>' +
        '<td class="num">' + count + ' 间</td>' +
        '<td>' + (canManage ? '<button class="btn-link" data-type="' + t.code + '">调整价格</button>' : '<span style="color:var(--ink-3)">—</span>') + '</td></tr>';
    }).join('');
    U.qs('#setBody').innerHTML =
      '<div class="card card-pad">' +
      '<div class="filter-bar"><span style="font-size:12px;color:var(--ink-3)">门市价是新建预订时的默认房价，单笔订单可单独议价</span></div>' +
      PMS.ui.table(cols, rows) + '</div>';
    U.qsa('[data-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = s.roomTypes.filter(function (x) { return x.code === b.getAttribute('data-type'); })[0];
        if (!t) return;
        PMS.ui.modal({
          title: '调整价格 · ' + t.name,
          body: PMS.ui.field('门市价（元/晚）', '<input class="input" id="tpPrice" type="number" min="1" value="' + t.basePrice + '">', { req: true }) +
            PMS.ui.field('房型名称', '<input class="input" id="tpName" value="' + U.escapeHtml(t.name) + '">'),
          footer: [
            { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); } },
            { text: '保存', cls: 'btn-primary', onClick: function (close, btn) {
              btn.disabled = true;
              PMS.api.updateRoomType(t.code, { basePrice: Number(U.qs('#tpPrice').value), name: U.qs('#tpName').value.trim() || t.name })
                .then(function () { PMS.ui.toast('房型价格已更新'); close(); render(U.qs('#pageHost')); })
                .catch(function (e) { PMS.ui.toast(e.message, 'err'); btn.disabled = false; });
            } }
          ]
        });
      });
    });
  }

  /* ---------- 数据管理 ---------- */
  function renderData() {
    var s = PMS.api.getState();
    var canManage = PMS.auth.can('settings.manage');
    U.qs('#setBody').innerHTML =
      '<div class="grid grid-2">' +
      '<div class="card card-pad">' +
      '<div class="card-title">演示数据</div>' +
      '<div class="info-list">' +
      '<div class="row"><span class="k">客房</span><span class="v num">' + s.rooms.length + ' 间</span></div>' +
      '<div class="row"><span class="k">订单</span><span class="v num">' + s.bookings.length + ' 单</span></div>' +
      '<div class="row"><span class="k">客人档案</span><span class="v num">' + s.guests.length + ' 位</span></div>' +
      '<div class="row"><span class="k">账单</span><span class="v num">' + s.folios.length + ' 张</span></div>' +
      '<div class="row"><span class="k">数据存储</span><span class="v">后端数据库（本地 SQLite / 部署 MySQL）</span></div>' +
      '</div>' +
      (canManage
        ? '<div style="display:flex;gap:10px;margin-top:16px">' +
          '<button class="btn btn-ghost" id="btnExport">导出数据 JSON</button>' +
          '<button class="btn btn-danger" id="btnReset">重置演示数据</button></div>' +
          '<div class="form-hint" style="margin-top:10px">重置将清空本地所有操作记录，恢复到初始演示状态（相对当天重新生成）。</div>'
        : '<div class="form-hint" style="margin-top:14px">仅系统管理员可导出与重置数据</div>') +
      '</div>' +
      '<div class="card card-pad">' +
      '<div class="card-title">关于系统</div>' +
      '<div class="info-list">' +
      '<div class="row"><span class="k">系统名称</span><span class="v">云澜 PMS · 酒店管理系统</span></div>' +
      '<div class="row"><span class="k">版本</span><span class="v num">v2.0.0（全栈版）</span></div>' +
      '<div class="row"><span class="k">架构</span><span class="v">原生前端 + FastAPI 后端</span></div>' +
      '<div class="row"><span class="k">数据层</span><span class="v">FastAPI + SQLAlchemy（JWT 鉴权）</span></div>' +
      '<div class="row"><span class="k">权限模型</span><span class="v">RBAC · 5 角色 × 页面 + 动作双层（服务端 + 前端双重校验）</span></div>' +
      '</div>' +
      '<div class="form-hint" style="margin-top:14px">本系统为全栈演示项目：前端对接 FastAPI 后端，数据持久化在后端数据库（本地默认 SQLite，部署可换 MySQL），所有写操作经服务端 RBAC 校验。</div>' +
      '</div>' +
      '</div>';

    var expBtn = U.qs('#btnExport');
    if (expBtn) expBtn.addEventListener('click', function () {
      try {
        var blob = new Blob([JSON.stringify(PMS.api.getState(), null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'yunlan-pms-data-' + U.today() + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        PMS.ui.toast('数据已导出');
      } catch (e) {
        PMS.ui.toast('导出失败：' + e.message, 'err');
      }
    });
    var resetBtn = U.qs('#btnReset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      PMS.ui.confirmDialog('确定<b style="color:var(--danger)">重置全部演示数据</b>吗？<br>当前所有订单、账单与客人档案的修改都会丢失，且不可恢复。', { danger: true, confirmText: '确认重置' })
        .then(function (yes) {
          if (!yes) return;
          PMS.api.resetData().then(function () {
            PMS.ui.toast('演示数据已重置');
            render(U.qs('#pageHost'));
          }).catch(function (e) { PMS.ui.toast(e.message, 'err'); });
        });
    });
  }

  PMS.pages.settings = {
    key: 'settings', title: '系统设置', perm: 'settings.view', group: '系统',
    icon: ICON, render: render
  };
})();
