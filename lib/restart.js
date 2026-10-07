// dsh-pocket 自重启：重新拉起启动本宿主的确切 dsh 调用（detached 交接），
// 让更新后的插件代码生效——用户无需离开界面手动重启。
//
// 方案借鉴 dshmarket 的 self-restart（lib/restart.js，MIT）：不直接拉起新
// 进程，而是先拉一个 detached 的 node 辅助进程，等旧进程退出、端口释放
// 后再拉起新 dsh，并把新进程输出写入临时日志——避免端口竞争
// （EADDRINUSE）导致新进程静默崩溃。
//
// 与 dshmarket 的差异：不赌固定 1.5s 延时，而是轮询探测端口真正释放
// （ECONNREFUSED）再拉起，旧进程退出慢也不会撞端口。
//
// 注意：新进程 detached，不挂终端——停止方式：lsof -ti :3080 | xargs kill -9。

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 自重启辅助进程（detached 交接的实际执行者），见 lib/restart-helper.mjs。 */
const HELPER_PATH = fileURLToPath(new URL('./restart-helper.mjs', import.meta.url));

/** 从启动参数里解析 dsh web 端口（--port/-p，含 --port=3080 形式），默认 3080。 */
export function dshPortFromArgs(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port' || a === '-p') {
      const n = Number(args[i + 1]);
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    } else if (a.startsWith('--port=')) {
      const n = Number(a.slice('--port='.length));
      if (Number.isInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  return 3080;
}

/** 重建启动调用（与当前宿主相同的命令，含 node 运行参数）。 */
function restartLaunch() {
  return {
    file: process.argv[0], // node
    args: [...process.execArgv, process.argv[1], ...process.argv.slice(2)], // [flags] <bin.js> + web [flags]
    cwd: process.cwd(),
  };
}

/**
 * 拉起替代宿主（detached 辅助进程交接），随后结束当前进程。
 * @param {object} opts
 * @param {object} [opts.internals] 测试注入：spawn / kill
 * @returns {{helperPid:number|null, logOut:string, logErr:string}}
 */
export function restartHost({ internals = {} } = {}) {
  const spawnFn = internals.spawn ?? spawn;
  const killFn = internals.kill ?? ((pid) => process.kill(pid, 'SIGTERM'));
  const launch = restartLaunch();
  const port = dshPortFromArgs(launch.args);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logOut = join(tmpdir(), `dsh-pocket-restart-${stamp}.out.log`);
  const logErr = join(tmpdir(), `dsh-pocket-restart-${stamp}.err.log`);
  // base64(JSON)：路径里的引号 / 空格 / 非 ASCII 不会破坏 argv 解析
  const helperArg = Buffer.from(JSON.stringify({ ...launch, logOut, logErr, port })).toString('base64');

  let helperPid = null;
  try {
    const helper = spawnFn(process.execPath, [HELPER_PATH, helperArg], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    helper.unref?.();
    helper.on?.('error', () => {}); // 参数异常等异步错误兜底，别让旧进程先崩
    helperPid = helper.pid ?? null;
    // 短暂等待后结束当前进程（释放端口）；由辅助进程探测到端口释放后拉起新宿主
    setTimeout(() => { try { killFn(process.pid); } catch { /* 忽略 */ } }, 500);
  } catch (err) {
    return { helperPid: null, logOut, logErr, error: err?.message ?? String(err) };
  }
  return { helperPid, logOut, logErr };
}
