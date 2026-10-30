/* 云澜 PMS · 认证与 RBAC 权限控制 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  var SESSION_KEY = 'pms.session.v1';

  /* 角色定义 */
  var ROLES = {
    manager:       { name: '店长',     desc: '全模块全部操作权限' },
    front:         { name: '前台',     desc: '预订 / 接待 / 客档 / 房态，可收款不可作废' },
    housekeeping:  { name: '客房部',   desc: '房态看板与客房清洁、维修任务' },
    finance:       { name: '财务',     desc: '账务、报表，可作废账目' },
    admin:         { name: '系统管理员', desc: '系统设置与全局只读' }
  };

  /* 权限矩阵（manager 通配全部） */
  var ROLE_PERMS = {
    manager: ['*'],
    front: [
      'dashboard.view', 'rooms.view', 'bookings.view', 'reception.view', 'guests.view',
      'housekeeping.view', 'billing.view',
      'bookings.create', 'bookings.edit', 'bookings.assign', 'bookings.cancel',
      'reception.checkin', 'reception.checkout',
      'guests.edit',
      'housekeeping.task',
      'billing.charge', 'billing.pay'
    ],
    housekeeping: [
      'rooms.view', 'housekeeping.view',
      'housekeeping.task', 'housekeeping.maint'
    ],
    finance: [
      'dashboard.view', 'billing.view', 'reports.view', 'guests.view',
      'billing.charge', 'billing.pay', 'billing.void'
    ],
    admin: [
      'dashboard.view', 'rooms.view', 'bookings.view', 'reception.view', 'guests.view',
      'housekeeping.view', 'billing.view', 'reports.view', 'settings.view', 'settings.manage'
    ]
  };

  var currentSession = null;

  function restore() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) currentSession = JSON.parse(raw);
    } catch (e) { currentSession = null; }
    return currentSession;
  }

  function setSession(user) {
    currentSession = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  }

  function logout() {
    currentSession = null;
    sessionStorage.removeItem(SESSION_KEY);
  }

  /* 权限判断：支持 '*' 通配与精确匹配 */
  function can(perm) {
    if (!currentSession) return false;
    var list = ROLE_PERMS[currentSession.role] || [];
    return list.some(function (p) { return p === '*' || p === perm; });
  }

  PMS.auth = {
    ROLES: ROLES,
    ROLE_PERMS: ROLE_PERMS,
    restore: restore,
    setSession: setSession,
    logout: logout,
    can: can,
    current: function () { return currentSession; }
  };
})();
