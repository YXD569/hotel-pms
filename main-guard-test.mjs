/* main.js 启动自检的隔离验证：
   1) file:// 打开 -> 必须拦下来、渲染警告、且不再发任何请求
   2) 0.0.0.0 打开 -> 同上
   3) 正常 localhost:8000 -> 必须放行，不能动 #app 的内容（防止误伤）
   运行：node main-guard-test.mjs
*/
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const SOURCES = [read('./js/utils.js'), read('./js/auth.js'), read('./js/api-client.js'), read('./js/main.js')];

let pass = 0;
const fails = [];
function check(name, ok, extra) {
  if (ok) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fails.push(name);
    console.log('  ✗ ' + name + (extra ? '  -> ' + extra : ''));
  }
}

function run(loc) {
  const appEl = { innerHTML: '' };
  let fetchCount = 0;
  const ctx = {
    console,
    JSON, Promise, Math, Date, Object, Array, String, Number, Error, RegExp,
    setTimeout, clearTimeout,
    location: Object.assign({ hash: '' }, loc),
    document: {
      getElementById: (id) => (id === 'app' ? appEl : null),
      querySelector: () => null,
      addEventListener() {},
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }),
      body: { appendChild() {}, contains: () => false },
    },
    sessionStorage: {
      _v: {},
      getItem(k) { return this._v[k] ?? null; },
      setItem(k, v) { this._v[k] = String(v); },
      removeItem(k) { delete this._v[k]; },
    },
    fetch() {
      fetchCount++;
      return Promise.reject(new TypeError('Failed to fetch'));
    },
    addEventListener() {},
  };
  ctx.window = ctx;
  /* 页面模块与路由在真实环境由各 pages/*.js 提供，这里只需桩住，避免守卫放行后继续执行时炸掉 */
  ctx.PMS = { pages: {}, router: { register() {}, render() {} }, ui: { toast() {} } };
  vm.createContext(ctx);
  SOURCES.forEach((src) => vm.runInContext(src, ctx));
  return { html: appEl.innerHTML, fetchCount };
}

console.log('== main.js 启动自检 ==');

const fileCase = run({ protocol: 'file:', hostname: '', port: '', href: 'file:///C:/Users/x/hotel-pms/index.html' });
check('file:// 被拦下并渲染提示', fileCase.html.includes('地址不对') && fileCase.html.includes('localhost:8000'));
check('file:// 明确指出是双击 index.html', fileCase.html.includes('file://'));
check('file:// 时不再发出任何请求', fileCase.fetchCount === 0, 'fetch 次数=' + fileCase.fetchCount);

const zeroCase = run({ protocol: 'http:', hostname: '0.0.0.0', port: '8000', href: 'http://0.0.0.0:8000/' });
check('0.0.0.0 被拦下并渲染提示', zeroCase.html.includes('0.0.0.0') && zeroCase.html.includes('localhost:8000'));
check('0.0.0.0 时不再发出任何请求', zeroCase.fetchCount === 0, 'fetch 次数=' + zeroCase.fetchCount);

const okCase = run({ protocol: 'http:', hostname: 'localhost', port: '8000', href: 'http://localhost:8000/' });
check('正常地址放行，不覆写 #app', okCase.html === '', JSON.stringify(okCase.html).slice(0, 120));

const remoteCase = run({ protocol: 'https:', hostname: 'pms.example.com', port: '', href: 'https://pms.example.com/' });
check('线上域名放行（不硬编码 8000 端口）', remoteCase.html === '', JSON.stringify(remoteCase.html).slice(0, 120));

console.log(`\n== 结果 ==\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  console.log('失败项：' + fails.join(' / '));
  process.exit(1);
}
console.log('✅ 启动自检行为符合预期');
