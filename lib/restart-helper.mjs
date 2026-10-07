// dsh-pocket 自重启辅助进程（由 lib/restart.js 以 detached 方式拉起）。
//
// 职责：等旧宿主的 dsh 端口真正释放（最多 20s）→ 拉起新的 dsh → 新进程输出写日志。
// 之所以单独成文件、而不是在父进程里拼一段 `node -e <code>` 的字符串源码：
// 字符串拼装的代码既没法被 lint / 类型检查，也只是把这段逻辑藏起来。
//
// 入参只有一个：`node restart-helper.mjs <base64(JSON)>`，JSON 形状
// `{ file, args, cwd, logOut, logErr, port }`（base64 避免引号 / 空格 / 非 ASCII
// 在命令行里被 shell 或 argv 解析破坏）。

import { spawn } from 'node:child_process';
import { appendFileSync, openSync } from 'node:fs';
import { connect } from 'node:net';

/** 轮询间隔与次数：200ms × 100 = 最多等 20s 端口释放。 */
const POLL_INTERVAL_MS = 200;
const POLL_TRIES = 100;
/** 端口释放后再缓一小会儿才拉起，避免 TIME_WAIT / 监听未完全退出。 */
const SETTLE_MS = 300;

const config = JSON.parse(Buffer.from(process.argv[2] ?? '', 'base64').toString('utf8'));

/** 端口是否已释放：能连上 = 仍被占用；连接被拒 = 已释放。 */
function portFree(port, cb) {
  const socket = connect(port, '127.0.0.1');
  socket.once('connect', () => { socket.destroy(); cb(false); });
  socket.once('error', () => cb(true));
}

function waitPort(port, tries, cb) {
  portFree(port, (free) => {
    if (free || tries <= 0) cb(free);
    else setTimeout(() => waitPort(port, tries - 1, cb), POLL_INTERVAL_MS);
  });
}

// 超时也照常拉起：宁可试拉一次并在日志留痕，也不让 dsh 起不来。
waitPort(config.port, POLL_TRIES, () => {
  setTimeout(() => {
    try {
      const out = openSync(config.logOut, 'a');
      const err = openSync(config.logErr, 'a');
      const child = spawn(config.file, config.args, {
        cwd: config.cwd,
        detached: true,
        stdio: ['ignore', out, err],
        env: process.env,
      });
      child.unref();
    } catch (ex) {
      try { appendFileSync(config.logErr, `restart helper failed: ${ex?.message ?? ex}\n`); } catch { /* 日志也写不了就放弃 */ }
    }
  }, SETTLE_MS);
});
