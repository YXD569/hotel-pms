/* 云澜 PMS · 通用工具 */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  /* ---------- DOM ---------- */
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 日期（本地时区，格式 YYYY-MM-DD） ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return toDateStr(new Date()); }
  function parseDate(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(s, n) {
    var d = parseDate(s);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function diffDays(a, b) { // b - a，按自然日
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function weekLabel(s) { return '周' + WEEK[parseDate(s).getDay()]; }
  function fmtDateCn(s) { // 10月30日 周五
    var p = String(s).split('-');
    return (+p[1]) + '月' + (+p[2]) + '日 ' + weekLabel(s);
  }

  /* ---------- 金额 ---------- */
  function fmtMoney(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    var s = (Math.round(n * 100) / 100).toFixed(2);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + '¥' + parts[0] + '.' + parts[1];
  }
  function fmtMoneyShort(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
    return '¥' + Math.round(n).toLocaleString();
  }

  /* ---------- 编号 ---------- */
  function uid(prefix) {
    return prefix + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 90 + 10);
  }

  /* ---------- 校验 ---------- */
  function isPhone(s) { return /^1[3-9]\d{9}$/.test(String(s || '')); }
  function isDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

  /* ---------- 深拷贝 ---------- */
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  PMS.utils = {
    qs: qs, qsa: qsa, escapeHtml: escapeHtml,
    today: today, parseDate: parseDate, addDays: addDays, diffDays: diffDays,
    weekLabel: weekLabel, fmtDateCn: fmtDateCn, toDateStr: toDateStr,
    fmtMoney: fmtMoney, fmtMoneyShort: fmtMoneyShort,
    uid: uid, isPhone: isPhone, isDateStr: isDateStr, deepCopy: deepCopy
  };
})();
