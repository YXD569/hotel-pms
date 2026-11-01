/* 云澜 PMS · 真实 API 端到端冒烟测试（Node，无需 Python）
 *
 * 说明：原 e2e-test.js 测试的是已被移除的本地 Mock 层（js/mock/api.js）。
 * 全栈改造后，业务流由 FastAPI 后端承载，完整的生命周期测试见 backend/test_api.py（Python）。
 * 本脚本用浏览器内置 fetch（Node 18+）对【正在运行的服务器】做 HTTP 级冒烟，
 * 可针对本地（uvicorn）或云端（Railway 域名）实例执行，无需安装任何依赖。
 *
 * 用法：
 *   node e2e-test.js                      # 默认 http://localhost:8000
 *   BASE_URL=https://你的 railway 域名     node e2e-test.js
 *
 * 前置：先启动后端（uvicorn app.main:app --port 8000）或部署到 Railway。
 */

'use strict';

const BASE = process.env.BASE_URL || 'http://localhost:8000';

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data };
}

async function main() {
  console.log('== 云澜 PMS · API 冒烟测试 ==');
  console.log('BASE_URL = ' + BASE + '\n');

  // 1) 健康检查（无需鉴权）
  let r = await req('GET', '/api/health');
  check('health 200', r.status === 200, JSON.stringify(r.data));
  check('health 返回 ok', r.data && r.data.status === 'ok');

  // 2) 错误密码 -> 401
  r = await req('POST', '/api/auth/login', { account: 'manager', password: 'wrong' });
  check('错误密码 401', r.status === 401, 'status=' + r.status);

  // 3) 无 token 访问 state -> 401
  r = await req('GET', '/api/state');
  check('无 token -> 401', r.status === 401, 'status=' + r.status);

  // 4) 正确登录 -> 拿到 token
  r = await req('POST', '/api/auth/login', { account: 'manager', password: '123456' });
  check('manager 登录 200', r.status === 200, 'status=' + r.status);
  const token = r.data && r.data.access_token;
  check('返回 access_token', !!token);
  if (!token) { console.log('\n❌ 无法获取 token，后续依赖鉴权的用例跳过'); return finish(); }

  // 5) 带 token 拉取聚合状态
  r = await req('GET', '/api/state', null, token);
  check('state 200', r.status === 200, 'status=' + r.status);
  const st = r.data || {};
  check('房态 >= 30 间', Array.isArray(st.rooms) && st.rooms.length >= 30, 'rooms=' + (st.rooms || []).length);
  check('员工脱敏(无 password)', Array.isArray(st.staff) && st.staff.every(s => !('password' in s)), '');
  check('dailyStats 14 天', Array.isArray(st.dailyStats) && st.dailyStats.length === 14, 'len=' + (st.dailyStats || []).length);
  check('账单含 extras/payments', Array.isArray(st.folios) && st.folios.every(f => Array.isArray(f.extras) && Array.isArray(f.payments)));

  // 6) 创建预订（后端做满房/日期校验）。
  // 注意：直接取本地年/月/日拼接，避免 toISOString() 在 UTC+8 下把日期往前滚一天导致“过期”。
  // 选 +120 天，远离种子预订（均落在今天附近），确保有空房。
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const arrive = new Date(); arrive.setDate(arrive.getDate() + 120);
  const depart = new Date(arrive); depart.setDate(depart.getDate() + 1);
  r = await req('POST', '/api/bookings', {
    guestName: '冒烟测试客', phone: '13800000000', typeCode: 'STD_D',
    source: 'walkin', arrive: iso(arrive), depart: iso(depart), price: 288, deposit: 0,
  }, token);
  check('创建预订 200', r.status === 200, 'status=' + r.status);
  check('预订状态 confirmed', r.data && r.data.status === 'confirmed');

  // 7) 过期日期预订 -> 400
  r = await req('POST', '/api/bookings', {
    guestName: '过期客', phone: '13800000001', typeCode: 'STD',
    source: 'walkin', arrive: '2020-01-01', depart: '2020-01-02', price: 288, deposit: 0,
  }, token);
  check('过期日期预订 400', r.status === 400, 'status=' + r.status);

  // 8) RBAC：前台越权 reset -> 403（需前台 token）
  let fr = await req('POST', '/api/auth/login', { account: 'front', password: '123456' });
  const frontToken = fr.data && fr.data.access_token;
  if (frontToken) {
    r = await req('POST', '/api/reset', null, frontToken);
    check('front 越权 reset -> 403', r.status === 403, 'status=' + r.status);
  } else {
    check('front 登录取 token', false);
  }

  // 9) 店长 reset -> 200（重置回演示数据）
  r = await req('POST', '/api/reset', null, token);
  check('manager reset 200', r.status === 200, 'status=' + r.status);

  finish();
}

function finish() {
  console.log('\n== 结果 ==');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) { console.log('失败项：' + fails.join(' / ')); console.log('\n❌ 冒烟测试未全部通过'); process.exit(1); }
  console.log('\n✅ API 冒烟测试全部通过');
  process.exit(0);
}

main().catch(e => { console.error('运行异常：', e); process.exit(1); });
