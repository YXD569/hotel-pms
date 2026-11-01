/* 云澜 PMS · 登录页 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  var DEMO = [
    { account: 'manager', label: '店长 · 陈云澜' },
    { account: 'front', label: '前台 · 苏晓' },
    { account: 'housekeeping', label: '客房部 · 王秀娟' },
    { account: 'finance', label: '财务 · 李算' },
    { account: 'admin', label: '系统管理员' }
  ];

  function render(app) {
    document.title = '登录 · 云澜 PMS';
    app.innerHTML =
      '<div class="login-wrap">' +
        '<div class="login-hero">' +
          '<div class="lh-mark">澜</div>' +
          '<div class="lh-name">云澜大酒店</div>' +
          '<div class="lh-en">YUNLAN GRAND HOTEL · PMS</div>' +
          '<div class="lh-slogan">一 房 一 帐，尽 在 掌 握</div>' +
        '</div>' +
        '<div class="login-panel">' +
          '<div class="login-box">' +
            '<h2>员工登录</h2>' +
            '<div class="lb-sub">请使用酒店内部账号登录管理系统</div>' +
            '<div class="form-row">' +
              '<label class="form-label" for="lgAccount">账号</label>' +
              '<input class="input" id="lgAccount" autocomplete="username" placeholder="员工账号">' +
            '</div>' +
            '<div class="form-row">' +
              '<label class="form-label" for="lgPwd">密码</label>' +
              '<input class="input" id="lgPwd" type="password" autocomplete="current-password" placeholder="密码">' +
              '<div class="form-err" id="lgErr"></div>' +
            '</div>' +
            '<button class="btn btn-primary" id="lgSubmit">登 录</button>' +
            '<div class="demo-accounts" id="lgDemo">' +
              '<div class="da-title">演示账号（密码均为 123456，点击填入）</div>' +
              '<div class="da-chips">' +
                DEMO.map(function (d) {
                  return '<button type="button" class="da-chip" data-acc="' + d.account + '">' + U.escapeHtml(d.label) + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var accInput = U.qs('#lgAccount');
    var pwdInput = U.qs('#lgPwd');
    var errBox = U.qs('#lgErr');

    function showErr(msg) {
      errBox.textContent = msg;
      errBox.classList.add('show');
    }

    function submit() {
      errBox.classList.remove('show');
      var account = accInput.value.trim();
      var password = pwdInput.value;
      if (!account) return showErr('请输入账号');
      if (!password) return showErr('请输入密码');
      var btn = U.qs('#lgSubmit');
      btn.disabled = true;
      btn.textContent = '登录中…';
      PMS.api.login(account, password).then(function (user) {
        PMS.auth.setSession(user);
        PMS.ui.toast('欢迎回来，' + user.name);
        PMS.router.navigate('dashboard');
        PMS.router.render();
      }).catch(function (e) {
        showErr(e.message || '登录失败，请重试');
        btn.disabled = false;
        btn.textContent = '登 录';
      });
    }

    U.qs('#lgSubmit').addEventListener('click', submit);
    [accInput, pwdInput].forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
    U.qsa('.da-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        accInput.value = chip.getAttribute('data-acc');
        pwdInput.value = '123456';
        errBox.classList.remove('show');
        U.qs('#lgSubmit').focus();
      });
    });
    accInput.focus();

    /* 生产环境（后端 /api/health 返回 demo:false）隐藏整块演示账号：
       密码是公开写死的，摆在登录页上等于给所有人一个后门。
       请求失败时保持原样（本地开发/后端未启动时不影响正常登录）。 */
    fetch('/api/health', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) {
        if (h && h.demo === false) {
          var box = U.qs('#lgDemo');
          if (box) box.remove();
        }
      })
      .catch(function () { /* 忽略：拿不到配置就按开发环境处理 */ });
  }

  PMS.pages = PMS.pages || {};
  PMS.pages.login = { key: 'login', render: render };
})();
