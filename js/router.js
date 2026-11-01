/* 云澜 PMS · 哈希路由 + 登录守卫 + 权限守卫 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var pages = [];   // 由 main.js 注册，{ key, title, perm, group, icon, render }

  function register(page) { pages.push(page); }
  function pagesForRole() {
    return pages.filter(function (p) { return !p.perm || PMS.auth.can(p.perm); });
  }

  function currentHash() {
    var h = location.hash.replace(/^#\/?/, '');
    return h.split('?')[0] || '';
  }

  function navigate(key) {
    location.hash = '#/' + key;
  }

  function roleName(role) {
    var r = PMS.auth.ROLES[role];
    return r ? r.name : (role || '未知角色');
  }

  function render() {
    var app = U.qs('#app');
    var user = PMS.auth.current();
    if (!user) {
      PMS.pages.login.render(app);
      return;
    }
    var key = currentHash();
    var page = pages.filter(function (p) { return p.key === key; })[0];
    if (!page) { key = 'dashboard'; page = pages.filter(function (p) { return p.key === key; })[0]; }
    if (!page) { app.innerHTML = ''; return; }
    if (page.perm && !PMS.auth.can(page.perm)) {
      app.innerHTML = '<div class="layout">' + sidebarHtml('') + mainHtml(
        '<div class="card card-pad" style="margin:40px auto;max-width:420px;text-align:center">' +
        '<p style="font-size:15px;font-weight:700;margin-bottom:8px">无权访问</p>' +
        '<p style="font-size:13px;color:var(--ink-2)">当前角色（' + U.escapeHtml(roleName(user.role)) +
        '）没有「' + U.escapeHtml(page.title) + '」的访问权限。</p></div>'
      );
      wireSidebar();
      return;
    }
    app.innerHTML = '<div class="layout">' + sidebarHtml(key) + mainHtml('<div id="pageHost"></div>');
    wireSidebar();
    var host = U.qs('#pageHost');
    page.render(host);
  }

  /* ---------- 布局骨架 ---------- */
  function sidebarHtml(activeKey) {
    var user = PMS.auth.current();
    var groups = {};
    var order = [];
    pagesForRole().forEach(function (p) {
      var g = p.group || '业务';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(p);
    });
    var nav = order.map(function (g) {
      return '<div class="nav-group-label">' + U.escapeHtml(g) + '</div>' +
        groups[g].map(function (p) {
          return '<div class="nav-item' + (p.key === activeKey ? ' active' : '') + '" data-nav="' + p.key + '" tabindex="0" role="link">' +
            p.icon + '<span>' + U.escapeHtml(p.title) + '</span></div>';
        }).join('');
    }).join('');
    return '<aside class="sidebar">' +
      '<div class="brand"><div class="brand-mark">澜</div>' +
      '<div><div class="brand-name">云澜 PMS</div><div class="brand-sub">HOTEL SYSTEM</div></div></div>' +
      nav +
      '<div class="sidebar-foot">云澜大酒店 · 内部管理系统<br>演示环境 v1.0</div>' +
      '</aside>';
  }

  function mainHtml(inner) {
    var user = PMS.auth.current();
    var T = U.today();
    return '<div class="main">' +
      '<header class="topbar">' +
      '<div class="topbar-date">营业日期 <b>' + U.fmtDateCn(T) + '</b></div>' +
      '<div class="topbar-right">' +
      '<div class="user-chip"><div class="user-avatar">' + U.escapeHtml(user.name.slice(0, 1)) + '</div>' +
      '<div><div class="u-name">' + U.escapeHtml(user.name) + '</div>' +
      '<div class="u-role">' + U.escapeHtml(roleName(user.role)) + '</div></div></div>' +
      '<button class="btn btn-ghost btn-sm" id="btnLogout">退出登录</button>' +
      '</div></header>' +
      '<div class="content">' + inner + '</div></div>';
  }

  function wireSidebar() {
    U.qsa('[data-nav]').forEach(function (el) {
      var go = function () { navigate(el.getAttribute('data-nav')); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    var logoutBtn = U.qs('#btnLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      PMS.auth.logout();
      navigate('login');
      render();
    });
  }

  window.addEventListener('hashchange', render);

  PMS.router = {
    register: register,
    navigate: navigate,
    render: render,
    pagesForRole: pagesForRole
  };
})();
