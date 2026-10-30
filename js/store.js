/* 云澜 PMS · 状态仓库（localStorage 持久化） */
(function () {
  'use strict';
  window.PMS = window.PMS || {};

  var KEY = 'pms.state.v1';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 损坏则重建 */ }
    var state = PMS.seed.buildState();
    save(state);
    return state;
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('PMS store: 持久化失败', e);
    }
  }

  function reset() {
    localStorage.removeItem(KEY);
    return load();
  }

  PMS.store = {
    load: load,
    save: save,
    reset: reset,
    KEY: KEY
  };
})();
