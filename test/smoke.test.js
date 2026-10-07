// 真实链路冒烟测试：不注入任何 stub，验证「真实代理转发 + polyfill 注入 + 状态快照 + RPC」。
// 之前的教训：测试全用 stub 会漏掉真实环境才出现的 bug（如 require 崩溃、未处理 rejection）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPocketService } from '../lib/service.mjs';
import { installPocketRpc } from '../lib/web-rpc.js';
import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS } from '../client/api.js';

/** 假 dsh web：返回一个简单 HTML 文档（走真实 qrcode / 真实代理，无 stub）。 */
async function fakeUpstream() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>dsh</title></head><body>real-dsh</body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

function fakeCtxConnection() {
  let handler = null;
  const handle = (channel, fn) => {
    assert.equal(channel, POCKET_RPC_CHANNEL);
    handler = fn;
    return () => { handler = null; };
  };
  return { rpc: { handle }, get handler() { return handler; } };
}

test('真实链路：代理转发 + polyfill 注入 + 状态快照（无 stub）', async () => {
  const up = await fakeUpstream();
  const home = await mkdtemp(join(tmpdir(), 'smoke-'));
  const service = createPocketService({ dshPort: up.address().port, port: 0, home });
  try {
    await service.startProxy();
    const st = await service.status();
    assert.equal(st.proxyRunning, true);
    assert.ok(st.proxyPort > 0, '拿到真实监听端口');

    // 真实代理转发到假 dsh web，且 HTML 被注入 randomUUID polyfill
    const res = await fetch(`http://127.0.0.1:${st.proxyPort}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('real-dsh'), '代理转发到上游');
    assert.ok(html.includes('randomUUID'), '非安全上下文 polyfill 已注入');

    // 状态快照：OAuth 视图 + LAN 候选（未配置时 originQrs 为空）
    assert.equal(st.oauth.configured, false, '未初始化 → 未配置视图');
    assert.deepEqual(st.originQrs, []);
    assert.ok(Array.isArray(st.lanCandidates), 'LAN 候选存在');
  } finally {
    await service.dispose();
    await new Promise((r) => up.close(r));
    await rm(home, { recursive: true, force: true });
  }
});

test('真实链路：RPC status 走真实 service（含 restartNotice）', async () => {
  const up = await fakeUpstream();
  const home = await mkdtemp(join(tmpdir(), 'smoke-rpc-'));
  const service = createPocketService({ dshPort: up.address().port, port: 0, home });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, { service, log: { error() {}, warn() {} } });
  try {
    await service.startProxy();
    const r = await conn.handler(POCKET_ENDPOINTS.status, {});
    assert.equal(r.ok, true);
    assert.equal(r.value.proxyRunning, true);
    assert.ok(r.value.proxyPort > 0);
    assert.deepEqual(
      r.value.oauth,
      { provider: 'gitee', configured: false, callbackOrigins: [], bound: false, boundLogin: null },
      'RPC 返回 OAuth 未配置视图',
    );
    assert.equal(r.value.restartNotice, null, '无重启标记');
  } finally {
    await service.dispose();
    await new Promise((r) => up.close(r));
    await rm(home, { recursive: true, force: true });
  }
});

/** 远程操控的客户端产物（手机端组件另有一份 mobile/client/client.js，由手机端用例覆盖）。 */
function remoteBundle() {
  return readFileSync(new URL('../client/client.js', import.meta.url), 'utf8');
}

test('client bundle 注入 React 绑定（回归：JSX 渲染需要 factory 里的 React）', async () => {
  // DSH 模块系统提供 react 为模块、非全局；esbuild classic JSX 生成 React.createElement，
  // 若 factory 不绑定 React，任何 JSX 组件渲染即崩（"React is not defined"）。
  const src = remoteBundle();
  assert.ok(src.includes('var React = require("react")'), '产物：factory 注入 React 绑定');
});

test('client bundle：status 访问必须可选链（回归：1.9.0 白屏——首次渲染 status=null 时裸 status.oauth 抛 TypeError）', async () => {
  // load() 是异步的：首次渲染时 status 为 null。远程访问区块渲染在安全分支之外，
  // 裸访问 status.oauth → React 整树崩溃 → 设置页白屏。
  // 修复：全部 status?.oauth。此测试防止再次出现裸访问（esbuild 会原样保留 ?.）。
  const src = remoteBundle();
  assert.ok(!src.includes('status.oauth'), 'bundle 不允许裸 status.oauth（必须可选链）');
  assert.ok(src.includes('status?.oauth'), 'bundle 存在可选链访问');
});

test('远程访问管理（v3）：bundle 提供 OAuth 登出所有设备 / 解除绑定的确认弹框与 RPC 调用', async () => {
  const src = remoteBundle();
  assert.ok(src.includes('oauth.rotateSession'), 'bundle 含会话轮换 RPC');
  assert.ok(src.includes('oauth.unbind'), 'bundle 含解绑 RPC');
});

test('Windows 更新 spawn（PR #54）：受管子进程的 spawn 必须带 shell 选项', async () => {
  const src = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8');
  const at = src.indexOf('function spawnManaged(');
  assert.ok(at > 0, '存在统一的受管子进程封装');
  const fn = src.slice(at, at + 700);
  assert.ok(fn.includes("shell: process.platform === 'win32'"), 'spawnManaged 带 shell: win32（npm shim ENOENT / Node22 EINVAL）');
  assert.ok(src.includes("spawnManaged('git'"), '源码安装（link:）更新走 git pull');
  assert.ok(src.includes('github:cup113/dsh-pocket-oauth'), 'github: 规格安装更新重跑 add 重新 pin main');
});

test('更新机制（GitHub 化）：版本检查只打本仓库 main，不再打 npm 原版的包名', async () => {
  // npm 上的 dsh-pocket 是**原版**（PIN 模型）。若版本检查回到 npm registry，
  // 原版一发新版就会诱导用户点「更新」，把插件整体换成另一个应用。
  const src = remoteBundle();
  assert.ok(
    src.includes('raw.githubusercontent.com/cup113/dsh-pocket-oauth/main/package.json'),
    '版本源 = 本仓库 main 的 package.json',
  );
  assert.ok(!src.includes('registry.npmjs.org/dsh-pocket'), '不再拿 npm 原版的版本号做比较');
  assert.ok(src.includes('originsGroupPublic'), '二维码分区（本机/局域网 vs 公网）已进产物');
  assert.ok(src.includes('copyContext'), '「复制排障上下文」入口已进产物');
  assert.ok(src.includes('execCommand'), '非安全上下文剪贴板兜底已进产物（设置页复制不再静默失败）');
});

test('产物同步：客户端产物必须与源码构建结果逐字节一致（否则测试在验旧产物）', async () => {
  // 本仓库把 esbuild 产物纳入版本控制，而下面若干测试直接读它断言行为——
  // 源码改了却没重建时，那些测试会对着旧产物「全绿」，形成假信心。
  // 这里把产物构建到临时目录再比对，保证测的永远是当前源码。
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const tmpDir = await mkdtemp(join(tmpdir(), 'dsh-pocket-build-'));
  const targets = [
    {
      label: 'client/client.js',
      out: join(tmpDir, 'client.js'),
      env: 'DSH_POCKET_CLIENT_OUT',
      committed: new URL('../client/client.js', import.meta.url),
    },
    {
      label: 'mobile/client/client.js',
      out: join(tmpDir, 'mobile-client.js'),
      env: 'DSH_POCKET_MOBILE_CLIENT_OUT',
      committed: new URL('../mobile/client/client.js', import.meta.url),
    },
  ];
  try {
    for (const target of targets) {
      await promisify(execFile)(process.execPath, ['client/build.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, [target.env]: target.out },
        timeout: 60_000,
      });
      const [fresh, onDisk] = await Promise.all([readFile(target.out), readFile(target.committed)]);
      assert.ok(
        fresh.equals(onDisk),
        `${target.label} 与源码不同步——先跑 npm run build:client（npm test 的 pretest 会自动跑）`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
