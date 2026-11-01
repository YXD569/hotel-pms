/* 云澜 PMS · 前端数据层单测（Node，无依赖，不需要后端）
 *
 * 目的：验证 js/api-client.js 发出的请求 URL 与错误文案，这是浏览器里点一下才会暴露、
 *       后端测试完全覆盖不到的一层。重点回归：
 *       1) 作废账单条目必须按「条目 id」打接口，不能按下标翻译；
 *       2) 后端未启动时必须给中文离线提示，而不是 "Failed to fetch"；
 *       3) FastAPI 422 的数组 detail 必须转成一句可读文案，不能变成 [object Object]。
 *
 * 用法：node client-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const SOURCES = [read('./js/utils.js'), read('./js/auth.js'), read('./js/api-client.js')];

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

/* 造一个最小运行环境：window 即全局，fetch 可编程，location 可按用例改写 */
function makeApp(responder, loc) {
  const calls = [];
  const ctx = {
    console,
    JSON, Promise, Math, Date, Object, Array, String, Number, Error,
    location: Object.assign({ hash: '', protocol: 'http:', hostname: 'localhost', port: '8000' }, loc),
    sessionStorage: {
      _v: {},
      getItem(k) { return this._v[k] ?? null; },
      setItem(k, v) { this._v[k] = String(v); },
      removeItem(k) { delete this._v[k]; },
    },
    fetch(url, opts) {
      calls.push({ url, method: (opts && opts.method) || 'GET', body: opts && opts.body });
      return responder(url, opts);
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  SOURCES.forEach((src) => vm.runInContext(src, ctx));
  // 注入一个已登录会话，让请求带上 token
  ctx.PMS.auth.setSession({ id: 'S001', name: '陈云澜', role: 'manager', token: 'TKN' });
  return { PMS: ctx.PMS, calls };
}

const okResponder = (url) => Promise.resolve({
  status: 200, ok: true, text: () => Promise.resolve(url === '/api/state' ? '{"rooms":[]}' : '{}'),
});

/* 1) 作废消费条目：按 id */
{
  const { PMS, calls } = makeApp(okResponder);
  await PMS.api.voidExtra('F12', 37);
  const call = calls.find((c) => c.url.includes('void-extra'));
  check('voidExtra 按条目 id 打接口', call && call.url === '/api/folios/F12/void-extra/37', call && call.url);
  check('作废后重新拉取 state', calls.some((c) => c.url === '/api/state'));
}

/* 2) 作废收款：按 id */
{
  const { PMS, calls } = makeApp(okResponder);
  await PMS.api.voidPayment('F12', 5);
  const call = calls.find((c) => c.url.includes('void-payment'));
  check('voidPayment 按条目 id 打接口', call && call.url === '/api/folios/F12/void-payment/5', call && call.url);
}

/* 3) 也接受条目对象 */
{
  const { PMS, calls } = makeApp(okResponder);
  await PMS.api.voidExtra('F3', { id: 9, name: '洗衣服务' });
  const call = calls.find((c) => c.url.includes('void-extra'));
  check('voidExtra 接受条目对象', call && call.url === '/api/folios/F3/void-extra/9', call && call.url);
}

/* 4) 后端没启动：中文离线提示 */
{
  const { PMS } = makeApp(() => Promise.reject(new TypeError('Failed to fetch')));
  let msg = '';
  try { await PMS.api.login('manager', '123456'); } catch (e) { msg = e && e.message; }
  check('后端未启动 -> 中文离线提示', !!msg && msg.includes('无法连接服务器'), msg);
}

/* 5) 422 数组 detail -> 可读文案 */
{
  const { PMS } = makeApp(() => Promise.resolve({
    status: 422, ok: false,
    text: () => Promise.resolve(JSON.stringify({
      detail: [{ loc: ['body', 'amount'], msg: 'Input should be a valid integer' }],
    })),
  }));
  let msg = '';
  try { await PMS.api.addPayment('F1', 10.5, '现金', ''); } catch (e) { msg = e && e.message; }
  check('422 数组 detail 转可读文案', !!msg && msg.includes('参数不合法') && msg.includes('amount'), msg);
  check('不再出现 [object Object]', !/\[object/.test(String(msg)), msg);
}

/* 6) 业务错误原样透出（400 的中文 detail 不能被离线提示覆盖） */
{
  const { PMS } = makeApp(() => Promise.resolve({
    status: 400, ok: false, text: () => Promise.resolve(JSON.stringify({ detail: '该房间尚未清洁，请先在客房管理中完成清洁任务' })),
  }));
  let msg = '';
  try { await PMS.api.checkIn('B1', '0203', 300, '现金'); } catch (e) { msg = e && e.message; }
  check('业务错误文案原样透出', msg === '该房间尚未清洁，请先在客房管理中完成清洁任务', msg);
}

/* 7) 401 清会话并回登录页 */
{
  const { PMS } = makeApp(() => Promise.resolve({ status: 401, ok: false, text: () => Promise.resolve('{"detail":"无效或过期的令牌"}') }));
  PMS.auth.setSession({ id: 'S001', token: 'EXPIRED' });
  let msg = '';
  try { await PMS.api.refresh(); } catch (e) { msg = e && e.message; }
  check('401 抛出可读提示', msg === '无效或过期的令牌', msg);
  check('401 清空会话', PMS.auth.current() === null);

  /* ---- 地址自检：同一句「连不上」，必须能分辨出是哪种打开方式错了 ---- */
  async function offlineText(loc) {
    const { PMS } = makeApp(() => Promise.reject(new TypeError('Failed to fetch')), loc);
    try {
      await PMS.api.refresh();
      return '(刷新意外成功)';
    } catch (e) {
      return (e && e.message) || String(e);
    }
  }

  const tFile = await offlineText({ protocol: 'file:', hostname: '', port: '' });
  check('file:// 打开 -> 指出是双击 index.html', tFile.includes('file://') && tFile.includes('localhost:8000'), tFile);

  const tZero = await offlineText({ protocol: 'http:', hostname: '0.0.0.0', port: '8000' });
  check('0.0.0.0 -> 指出这是监听地址不是访问地址', tZero.includes('0.0.0.0') && tZero.includes('localhost:8000'), tZero);

  const tPort = await offlineText({ protocol: 'http:', hostname: 'localhost', port: '5500' });
  check('Live Server 端口 -> 指出用错工具', tPort.includes('5500') && tPort.includes('localhost:8000'), tPort);

  const tDown = await offlineText({ protocol: 'http:', hostname: 'localhost', port: '8000' });
  check('端口对但服务没起 -> 让回终端看进程', tDown.includes('没有响应'), tDown);

  /* 后端完全可能被起在 8001，此时不能反过来责怪用户「端口敲错了」 */
  const tCustom = await offlineText({ protocol: 'http:', hostname: 'localhost', port: '8001' });
  check('自定义端口 8001 -> 不误报为端口错误', tCustom.includes('8001') && !tCustom.includes('Live Server'), tCustom);
}

console.log(`\n== 结果 ==\n通过 ${pass} 项，失败 ${fail} 项`);
if (fail) { console.log('失败项：' + fails.join(' / ')); process.exit(1); }
console.log('✅ 前端数据层行为符合预期');
