/* 云澜 PMS · 应用启动 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  /* 先恢复会话（读取可能已保存的 JWT），再异步拉取后端全量数据 */
  PMS.auth.restore();

  /* 启动数据层（异步：用已恢复的 token 拉取 GET /api/state），完成后再注册页面并渲染 */
  PMS.api.init().then(function () {
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
  });
})();
