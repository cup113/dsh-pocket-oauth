// 插件入口测试：apply 用最小 fake ctx 启动（stub 网络），验证 RPC 面（OAuth 状态/
// 会话轮换/解绑/恢复出厂）与清理，全部走真实的 index.js + web-rpc.js + 文件系统。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { apply } from '../lib/index.js';
import { POCKET_ENDPOINTS } from '../client/api.js';

async function waitFor(check, message) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await setTimeout(10);
  }
  assert.fail(message);
}

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-pocket-entry-'));
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  const disposers = [];
  t.after(async () => {
    for (const dispose of disposers.reverse()) await dispose();
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    await rm(dir, { recursive: true, force: true });
  });

  function mount({ desktop = false } = {}) {
    let handler;
    let proxyReady = false;
    let disposed = false;
    let cleanup;
    const injectListeners = [];
    const ctx = {
      webServer: { port: 3080 },
      connection: { rpc: { handle: (_channel, fn) => { handler = fn; return () => {}; } } },
      get: (name) => desktop && name === 'desktopProfiles' ? {} : undefined,
      logger: () => ({
        info(message) { if (message.includes('proxy ready')) proxyReady = true; },
        warn() {}, error() {},
      }),
      effect: (callback) => { cleanup = callback(); },
      // 组件开关注入（webserver/index-inject）：测试直接触发监听，检查注入行
      on: (event, fn) => { if (event === 'webserver/index-inject') injectListeners.push(fn); },
    };
    // Keep the real entry, service and RPC; only the network boundary is stubbed.
    apply(ctx, {}, {
      createProxy: async () => ({ port: 3081, close: async () => {} }),
      lanCandidates: async () => ['192.168.1.2'],
      encodeQr: async () => 'data:qr',
    });
    const dispose = async () => { if (!disposed) { disposed = true; await cleanup(); } };
    disposers.push(dispose);
    return {
      ready: () => waitFor(() => proxyReady, 'entry did not start its proxy'),
      call: (endpoint, payload = {}) => handler(endpoint, payload),
      injectListeners: () => [...injectListeners],
      dispose,
    };
  }
  return { dir, mount };
}

for (const desktop of [false, true]) {
  test(`plugin entry exposes OAuth status and proxy state via RPC (desktop=${desktop})`, async (t) => {
    const f = await fixture(t);
    const entry = f.mount({ desktop });
    await entry.ready();

    const s = await entry.call(POCKET_ENDPOINTS.status, {});
    assert.equal(s.ok, true);
    assert.equal(s.value.proxyRunning, true);
    assert.equal(s.value.proxyPort, 3081);
    assert.deepEqual(
      s.value.oauth,
      { provider: 'gitee', configured: false, callbackOrigins: [], bound: false, boundLogin: null },
      '未初始化时 status 携带未配置视图',
    );
    assert.equal(s.value.desktop, desktop);
    await entry.dispose();
  });
}

test('plugin entry wires oauth.rotateSession / oauth.unbind / pocket.reset to real state', async (t) => {
  const f = await fixture(t);
  const entry = f.mount({});
  await entry.ready();

  const { writeOAuthConfig, readOAuthConfig } = await import('../lib/oauth.mjs');
  writeOAuthConfig({
    clientId: 'cid', clientSecret: 'sec',
    callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice',
  });

  // status 反映绑定
  const s1 = await entry.call(POCKET_ENDPOINTS.status, {});
  assert.equal(s1.value.oauth.bound, true);
  assert.equal(s1.value.oauth.boundLogin, 'alice');
  assert.ok(!JSON.stringify(s1.value).includes('sec'), 'status 不泄露 secret');

  // 解绑：凭据保留
  const u = await entry.call(POCKET_ENDPOINTS.oauthUnbind, {});
  assert.equal(u.ok, true);
  assert.equal(u.value.oauth.bound, false);
  assert.equal(readOAuthConfig().clientId, 'cid', '凭据保留');

  // 轮换会话
  const r = await entry.call(POCKET_ENDPOINTS.oauthRotateSession, {});
  assert.equal(r.ok, true);
  assert.equal(r.value.rotated, true);

  // 恢复出厂：需要确认 + 清空 OAuth
  const denied = await entry.call(POCKET_ENDPOINTS.pocketReset, {});
  assert.equal(denied.ok, false, '未确认被拒');
  const reset = await entry.call(POCKET_ENDPOINTS.pocketReset, { confirm: true });
  assert.equal(reset.ok, true);
  assert.equal(reset.value.oauth.configured, false, '重置后回到未配置');
  assert.equal(readOAuthConfig(), null, 'oauth.json 已清除');

  await entry.dispose();
});

// 组件边界（回归）：远程操控行只服务自己的端点——手机端组件的端点（右栏开关、复制文件内容）
// 已随旧移动端适配一起删除，在 remote 通道上仍然是未知端点，必须明确报 bad-request 而不是
// 静默成功；status 也不携带任何手机端字段（避免将来有人把它们偷偷加回设置页）。
test('plugin entry keeps component boundaries: mobile endpoints are not served on /dsh-pocket', async (t) => {
  const f = await fixture(t);
  const entry = f.mount({});
  await entry.ready();

  const s = await entry.call(POCKET_ENDPOINTS.status, {});
  assert.equal(s.ok, true);
  assert.equal('mobileRightbarEnabled' in s.value, false, 'status 不携带手机端组件字段（它不读写 settings.json）');

  for (const endpoint of ['mobile.status', 'mobile.rightbar.setEnabled', 'mobile.fileRead']) {
    const res = await entry.call(endpoint, { on: true, path: 'package.json' });
    assert.equal(res.ok, false, `${endpoint} 不应由远程操控行服务`);
    assert.equal(res.error.code, 'bad-request');
  }

  await entry.dispose();
});

// 组件开关协议已删除（回归）：远程操控行不再往页面注入标记——开关语义改由
// 「row 是否启用 → DSH 是否把这个包的客户端产物放进图」决定，所以这里不该有注入监听。
test('plugin entry no longer injects a component flag into the page', async (t) => {
  const f = await fixture(t);
  const entry = f.mount({});
  await entry.ready();

  assert.deepEqual(entry.injectListeners(), [], '不应注册任何 webserver/index-inject 监听');

  await entry.dispose();
});
