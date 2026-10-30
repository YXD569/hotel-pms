/* 云澜 PMS · UI 组件：模态 / 抽屉 / 确认框 / Toast / 表格 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};
  var U = PMS.utils;

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var wrap = U.qs('#toastWrap');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  }

  /* ---------- 模态框 ---------- */
  function modal(opts) {
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + U.escapeHtml(opts.title || '对话框') + '">' +
        '<div class="modal-head"><h3>' + U.escapeHtml(opts.title || '') + '</h3>' +
        '<button class="modal-close" aria-label="关闭">×</button></div>' +
        '<div class="modal-body"></div>' +
        (opts.footer === null ? '' : '<div class="modal-foot"></div>') +
      '</div>';
    var body = U.qs('.modal-body', mask);
    var foot = U.qs('.modal-foot', mask);
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    function close() {
      mask.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    U.qs('.modal-close', mask).addEventListener('click', close);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    document.addEventListener('keydown', onKey);

    if (foot && opts.footer !== null) {
      var btns = opts.footer || [{ text: '取 消', cls: 'btn-ghost', onClick: close }, { text: '确 定', cls: 'btn-primary' }];
      btns.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'btn ' + (b.cls || 'btn-primary');
        el.innerHTML = U.escapeHtml(b.text);
        if (b.onClick) el.addEventListener('click', function () { b.onClick(close, el); });
        foot.appendChild(el);
      });
    }
    document.body.appendChild(mask);
    var firstInput = U.qs('input, select, textarea, button.btn-primary', mask);
    if (firstInput && !opts.noFocus) firstInput.focus();
    return { close: close, el: mask };
  }

  /* ---------- 确认框（Promise） ---------- */
  function confirmDialog(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      modal({
        title: opts.title || '请确认',
        body: '<p style="font-size:13.5px;line-height:1.8">' + msg + '</p>',
        footer: [
          { text: '取 消', cls: 'btn-ghost', onClick: function (close) { close(); resolve(false); } },
          {
            text: opts.confirmText || '确 定',
            cls: opts.danger ? 'btn-danger' : 'btn-primary',
            onClick: function (close) { close(); resolve(true); }
          }
        ]
      });
    });
  }

  /* ---------- 抽屉 ---------- */
  function drawer(opts) {
    var mask = document.createElement('div');
    mask.className = 'drawer-mask';
    var panel = document.createElement('div');
    panel.className = 'drawer';
    panel.setAttribute('role', 'dialog');
    panel.innerHTML =
      '<div class="drawer-head"><h3>' + U.escapeHtml(opts.title || '') + '</h3>' +
      '<button class="modal-close" aria-label="关闭">×</button></div>' +
      '<div class="drawer-body"></div>' +
      (opts.footer ? '<div class="drawer-foot"></div>' : '');
    var body = U.qs('.drawer-body', panel);
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    var foot = U.qs('.drawer-foot', panel);

    function close() {
      mask.remove(); panel.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    U.qs('.modal-close', panel).addEventListener('click', close);
    mask.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);

    if (foot && opts.footer) {
      opts.footer.forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'btn ' + (b.cls || 'btn-primary');
        el.innerHTML = U.escapeHtml(b.text);
        el.addEventListener('click', function () { b.onClick(close, el); });
        foot.appendChild(el);
      });
    }
    document.body.appendChild(mask);
    document.body.appendChild(panel);
    return { close: close, el: panel };
  }

  /* ---------- 表格 ---------- */
  function table(cols, rowsHtml) {
    var thead = cols.map(function (c) {
      return '<th' + (c.w ? ' style="width:' + c.w + '"' : '') + '>' + c.text + '</th>';
    }).join('');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + thead + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }

  /* ---------- 表单行 ---------- */
  function field(label, inner, opts) {
    opts = opts || {};
    return '<div class="form-row' + (opts.full ? '' : '') + '">' +
      '<label class="form-label">' + label + (opts.req ? '<span class="req">*</span>' : '') + '</label>' +
      inner + (opts.hint ? '<div class="form-hint">' + opts.hint + '</div>' : '') +
      (opts.err ? '<div class="form-err" data-err="' + opts.err + '"></div>' : '') +
      '</div>';
  }

  /* ---------- 徽章 ---------- */
  function badge(label, cls) {
    return '<span class="badge ' + cls + '">' + U.escapeHtml(label) + '</span>';
  }

  /* ---------- 空状态 ---------- */
  function empty(text, ctaHtml) {
    return '<div class="empty"><div class="empty-icon">◇</div>' + U.escapeHtml(text) +
      (ctaHtml ? '<div class="empty-cta">' + ctaHtml + '</div>' : '') + '</div>';
  }

  PMS.ui = {
    toast: toast, modal: modal, confirmDialog: confirmDialog,
    drawer: drawer, table: table, field: field, badge: badge, empty: empty
  };
})();
