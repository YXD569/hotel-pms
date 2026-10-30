/* 云澜 PMS · 应用启动 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  /* 初始化数据层 */
  PMS.api.init();

  /* 恢复会话 */
  PMS.auth.restore();

  /* 注册页面（导航顺序） */
  [
    PMS.pages.dashboard,
    PMS.pages.rooms,
    PMS.pages.bookings,
    PMS.pages.reception,
    PMS.pages.guests,
    PMS.pages.housekeeping,
    PMS.pages.billing,
    PMS.pages.reports,
    PMS.pages.settings
  ].forEach(function (p) {
    if (p) PMS.router.register(p);
  });

  /* 默认路由 */
  if (!location.hash || location.hash === '#/' || location.hash === '#/login') {
    location.hash = PMS.auth.current() ? '#/dashboard' : '#/login';
  }

  PMS.router.render();
})();
