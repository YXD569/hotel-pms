/* 云澜 PMS · 应用启动 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  /* 启动前的地址自检。
     file:// 双击 index.html、照抄终端里的 0.0.0.0，这两种打开方式下页面能正常渲染，
     但接口请求必然全部失败，表现就是「登录说连不上服务器」——最容易让人以为是后端坏了。
     与其让人对着报错猜，不如在渲染前把原因和可点的正确地址摆出来。
     只拦这两种「一定错」的情况，端口不写死 8000，避免误伤线上部署（域名 + 80/443）。 */
  function blockedReason() {
    if (location.protocol === 'file:') {
      return '当前页面是双击 index.html 用 file:// 打开的。浏览器在这种协议下不允许页面请求后端接口，所以登录一定会失败。';
    }
    if (location.hostname === '0.0.0.0') {
      return '当前地址是 0.0.0.0。那是后端「监听所有网卡」用的地址，不是给浏览器访问的，可能被代理或安全策略拦下。';
    }
    return null;
  }

  var blocked = blockedReason();
  if (blocked) {
    var target = 'http://localhost:8000';
    var app = document.getElementById('app');
    if (app) {
      app.innerHTML =
        '<div style="max-width:660px;margin:10vh auto;padding:0 24px;'
        + 'font-family:system-ui,-apple-system,\'Microsoft YaHei\',sans-serif;color:#222;line-height:1.75">'
        + '<div style="font-size:13px;letter-spacing:.14em;color:#c08a3e;font-weight:700">YUNLAN PMS · 启动自检</div>'
        + '<h1 style="font-size:23px;margin:10px 0 10px">地址不对，后端本身没有问题</h1>'
        + '<p style="margin:0 0 18px;color:#555">' + blocked + '</p>'
        + '<p style="margin:0 0 10px;font-weight:600">把这个地址复制到浏览器地址栏打开：</p>'
        + '<p style="margin:0 0 22px"><a href="' + target + '" style="display:inline-block;padding:11px 20px;'
        + 'background:#1f6feb;color:#fff;border-radius:7px;text-decoration:none;font-weight:600">'
        + target + '</a></p>'
        + '<p style="margin:0 0 8px;font-size:13px;color:#888">打开前请确认终端里后端还在跑'
        + '（有 <code style="background:#f2f2f2;padding:1px 5px;border-radius:3px">Uvicorn running on http://0.0.0.0:8000</code> 这一行）。'
        + '没在跑就先执行：</p>'
        + '<pre style="background:#f5f5f5;border:1px solid #e5e5e5;padding:12px 14px;border-radius:7px;'
        + 'font-size:13px;overflow:auto;margin:0">cd backend\n./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000</pre>'
        + '</div>';
    }
    return; // 不再初始化数据层，避免继续发出注定失败的请求
  }

  /* 先恢复会话（读取可能已保存的 JWT），再异步拉取后端全量数据 */
  PMS.auth.restore();

  /* 启动数据层（异步：用已恢复的 token 拉取 GET /api/state），完成后再注册页面并渲染 */
  PMS.api.init().then(function (state) {
    /* 有会话却拿不到数据（后端未启动 / 网络异常）：清掉失效会话，回到登录页并提示，
       避免页面在 state 为 null 时抛异常导致整屏空白 */
    if (!state && PMS.auth.current()) {
      PMS.auth.logout();
      PMS.ui.toast('无法连接服务器，请确认后端已启动后重新登录', 'err');
    }

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
