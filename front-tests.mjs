/* 前端测试总入口：顺序执行两个 Node 测试脚本，任一失败则整体失败。
   单独写入口是因为 tasks.json 要用一条跨 shell 都能跑的命令（PowerShell 5.1 不支持 &&，
   Git Bash 不支持 if ($?)），在 node 里串行调度两边都不会踩坑。
   运行：node front-tests.mjs
*/
import { spawnSync } from 'node:child_process';

const SUITES = [
  { file: 'client-test.mjs', name: '前端数据层（api-client 行为）' },
  { file: 'main-guard-test.mjs', name: '启动自检（地址拦截）' },
];

const failed = [];
for (const s of SUITES) {
  console.log(`\n===== ${s.name} =====`);
  const r = spawnSync(process.execPath, [s.file], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(s.file);
}

console.log('');
if (failed.length) {
  console.error('❌ 有测试未通过：' + failed.join(' / '));
  process.exit(1);
}
console.log('✅ 前端两组测试全部通过');
