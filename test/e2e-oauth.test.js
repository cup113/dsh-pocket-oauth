// 真实链路 E2E（v3 OAuth）：真插件入口 + 真 service + 真反向代理 + 真 HTTP + 真磁盘持久化。
// 唯一被替换的是外部鉴权方端点（网络边界），其余全部走生产代码路径。
//
// 覆盖用户旅程（Gitee 与 GitHub 各一条）：
//   未初始化 fail closed → 本机 setup 选鉴权方并保存凭据 → 本机完成绑定（写盘）
//   → 本机 loopback 免登录 → 隧道域名用同一账号登录（种 cookie）→ 带 cookie 访问上游
//   → 换账号被拒 → 重启（新进程密钥）旧 cookie 失效

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { apply } from '../lib/index.js';
import { POCKET_ENDPOINTS } from '../client/api.js';
import { SESSION_COOKIE } from '../lib/oauth.mjs';

/** 假 dsh web（真实 HTTP 上游）。 */
async function fakeUpstream() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head></head><body>real-dsh-upstream</body></html>');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return server;
}

/** 桩 Gitee：token 交换 + 用户信息（uid/login 可切换以模拟不同账号；Gitee 风格 = 同域 + query token）。 */
function stubGitee(state = { uid: '4242', login: 'alice' }) {
  return async (url) => {
    if (String(url).endsWith('/oauth/token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-1', token_type: 'bearer' }) };
    }
    if (String(url).includes('/api/v5/user')) {
      return { ok: true, status: 200, json: async () => ({ id: Number(state.uid), login: state.login }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

/** 桩 GitHub：token 在 github 域、用户信息在 api 域且要 Bearer 头（认错了就 401）。 */
function stubGithub(state = { uid: '4242', login: 'alice' }) {
  return async (url, init) => {
    const auth = String(init?.headers?.authorization ?? '');
    if (String(url).endsWith('/login/oauth/access_token')) {
      if (init?.headers?.accept !== 'application/json') {
        return { ok: true, status: 200, json: async () => ({}) }; // 少了 Accept 头 → 拿不到 access_token
      }
      return { ok: true, status: 200, json: async () => ({ access_token: 'gho-1', token_type: 'bearer' }) };
    }
    if (String(url).endsWith('/user')) {
      if (!auth.startsWith('Bearer ')) {
        return { ok: false, status: 401, json: async () => ({ message: 'Requires authentication' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: Number(state.uid), login: state.login }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

function raw(port, { method = 'GET', path = '/', host = '127.0.0.1', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        setCookie: res.headers['set-cookie'],
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** 起真实插件入口（只桩外部鉴权方 + 网络边界 stub 掉桌面检测）。
 *  applyFn 由调用方给出：需要模拟「新进程」时用带缓存击穿的模块实例（见 loadEntry）。
 *  两家的端点基址都注入，测试里用 setup 表单选择实际使用哪一家。 */
async function startEntry({ upstreamPort, dshHome, gitee, github, applyFn = apply }) {
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = dshHome;
  let handler = null;
  let cleanup = null;
  const giteeStub = stubGitee(gitee);
  const githubStub = stubGithub(github ?? gitee);
  const ctx = {
    webServer: { port: upstreamPort },
    connection: { rpc: { handle: (_channel, fn) => { handler = fn; return () => {}; } } },
    get: () => undefined,
    logger: () => ({ info() {}, warn() {}, error() {} }),
    effect: (callback) => { cleanup = callback(); },
  };
  applyFn(ctx, {}, {
    port: 0,
    oauthTestHooks: {
      giteeBase: 'http://gitee.test',
      githubBase: 'http://github.test',
      githubApiBase: 'http://api.github.test',
      fetchImpl: (url, init) => (String(url).includes('github.test') ? githubStub(url, init) : giteeStub(url, init)),
    },
  });
  // 等代理就绪并拿到真实端口
  let port = null;
  for (let i = 0; i < 200 && port === null; i++) {
    await setTimeout(10);
    try {
      const s = await handler(POCKET_ENDPOINTS.status, {});
      if (s?.ok && s.value?.proxyRunning && s.value?.proxyPort) port = s.value.proxyPort;
    } catch { /* 尚未注册 */ }
  }
  assert.ok(port, '真实入口未启动代理');
  return {
    port,
    call: (endpoint, payload) => handler(endpoint, payload),
    restoreHome: () => {
      if (previous === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previous;
    },
    dispose: async () => { if (cleanup) await cleanup(); },
  };
}

test('E2E（Gitee）：未初始化 fail closed → 本机绑定（写盘）→ 本机免登录 → 隧道域名同账号登录 → 换账号被拒', async () => {
  const up = await fakeUpstream();
  const home = await mkdtemp(join(tmpdir(), 'dshp-e2e-'));
  const gitee = { uid: '4242', login: 'alice' };
  const entry = await startEntry({ upstreamPort: up.address().port, dshHome: home, gitee });
  const loopbackHost = `127.0.0.1:${entry.port}`;
  const tunnelHost = 'pocket.example.com';
  try {
    // 1) 未初始化：非 loopback 一律 fail closed（fail closed 的真实证明）
    const blocked = await raw(entry.port, { host: tunnelHost, headers: { accept: 'text/html' } });
    assert.equal(blocked.status, 503, '未初始化时隧道域名被拒');
    assert.match(blocked.body, /pocket-setup/, '给出本机初始化入口');

    // 2) 本机 loopback 免认证：直通真实上游
    const local = await raw(entry.port, { host: loopbackHost });
    assert.equal(local.status, 200, 'loopback 免认证');
    assert.match(local.body, /real-dsh-upstream/);

    // 3) 本机 setup 保存凭据（真实写盘；表单回传初始化页下发的 nonce）
    const setupPage = await raw(entry.port, { host: loopbackHost, path: '/pocket-setup' });
    const nonce = /<input type="hidden" name="nonce" value="([0-9a-f]+)">/.exec(setupPage.body)?.[1];
    assert.ok(nonce, '初始化页带 nonce');
    const save = await raw(entry.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        nonce,
        client_id: 'cid', client_secret: 'sec',
        origins: `http://${loopbackHost}\nhttps://${tunnelHost}`,
      }).toString(),
    });
    assert.equal(save.status, 303);
    const onDisk = JSON.parse(await readFile(join(home, 'dsh-pocket', 'oauth.json'), 'utf8'));
    assert.equal(onDisk.clientSecret, 'sec', '凭据真实落盘');
    assert.equal(onDisk.boundUid, null, '尚未绑定');

    // 4) 本机完成 Gitee 绑定（走真实 start → callback）
    const bindStart = await raw(entry.port, { host: loopbackHost, path: '/pocket-oauth/start?bind=1' });
    assert.equal(bindStart.status, 302, '本机可发起绑定');
    const bindState = new URL(bindStart.location).searchParams.get('state');
    const bindCb = await raw(entry.port, { host: loopbackHost, path: `/pocket-oauth/callback?code=c1&state=${bindState}` });
    assert.equal(bindCb.status, 200);
    assert.match(bindCb.body, /绑定成功/);
    const bound = JSON.parse(await readFile(join(home, 'dsh-pocket', 'oauth.json'), 'utf8'));
    assert.equal(bound.boundUid, '4242', '绑定的 uid 落盘');
    assert.equal(bound.boundLogin, 'alice');

    // 5) 隧道域名：登录前要 Gitee 登录页
    const loginWall = await raw(entry.port, { host: tunnelHost, headers: { accept: 'text/html' } });
    assert.equal(loginWall.status, 200);
    assert.match(loginWall.body, /使用 Gitee 账号登录/);

    // 6) 同一账号登录：start → callback → 种会话 cookie
    const start = await raw(entry.port, { host: tunnelHost, path: '/pocket-oauth/start' });
    assert.equal(start.status, 302);
    const authorize = new URL(start.location);
    assert.equal(authorize.searchParams.get('redirect_uri'), `https://${tunnelHost}/pocket-oauth/callback`, 'redirect_uri = 当前 origin 的回调');
    const state = authorize.searchParams.get('state');
    const cb = await raw(entry.port, { host: tunnelHost, path: `/pocket-oauth/callback?code=c2&state=${state}` });
    assert.equal(cb.status, 303, '登录成功重定向回首页');
    const cookie = (Array.isArray(cb.setCookie) ? cb.setCookie.join('; ') : String(cb.setCookie ?? ''))
      .match(new RegExp(`${SESSION_COOKIE}=([0-9a-f]+)`))?.[1];
    assert.ok(cookie, '种下会话 cookie');

    // 7) 带 cookie 访问真实上游
    const authed = await raw(entry.port, { host: tunnelHost, path: '/api/session', headers: { cookie: `${SESSION_COOKIE}=${cookie}` } });
    assert.equal(authed.status, 200, '登录后可访问');
    assert.match(authed.body, /real-dsh-upstream/);

    // 8) 换绑另一个 Gitee 账号 → 被拒（发起绑定只能本机，这里直接验证登录路径的 uid 比对）
    gitee.uid = '9999';
    gitee.login = 'mallory';
    const start2 = await raw(entry.port, { host: tunnelHost, path: '/pocket-oauth/start' });
    const state2 = new URL(start2.location).searchParams.get('state');
    const cb2 = await raw(entry.port, { host: tunnelHost, path: `/pocket-oauth/callback?code=c3&state=${state2}` });
    assert.equal(cb2.status, 403, '非绑定账号被拒');
    assert.match(cb2.body, /mallory/);
    gitee.uid = '4242';
    gitee.login = 'alice';

    // 9) 登出所有设备（RPC 轮换会话密钥）→ 旧 cookie 失效
    const rotated = await entry.call(POCKET_ENDPOINTS.oauthRotateSession, {});
    assert.equal(rotated.ok, true);
    const stale = await raw(entry.port, { host: tunnelHost, path: '/api/session', headers: { cookie: `${SESSION_COOKIE}=${cookie}`, accept: 'application/json' } });
    assert.equal(stale.status, 401, '轮换后旧会话失效');
  } finally {
    await entry.dispose();
    entry.restoreHome();
    await new Promise((r) => up.close(r));
    await rm(home, { recursive: true, force: true });
  }
});

test('E2E（GitHub）：未初始化 fail closed → 本机选 GitHub 绑定（写盘）→ 隧道域名同账号登录 → 换账号被拒', async () => {
  const up = await fakeUpstream();
  const home = await mkdtemp(join(tmpdir(), 'dshp-e2e-gh-'));
  const github = { uid: '8801', login: 'octocat' };
  const entry = await startEntry({ upstreamPort: up.address().port, dshHome: home, github });
  const loopbackHost = `127.0.0.1:${entry.port}`;
  const tunnelHost = 'pocket.example.com';
  try {
    // 1) 未初始化：隧道域名 fail closed，且指引里两家创建入口都在
    const blocked = await raw(entry.port, { host: tunnelHost, headers: { accept: 'text/html' } });
    assert.equal(blocked.status, 503);
    assert.match(blocked.body, /gitee\.com\/oauth\/applications/);
    assert.match(blocked.body, /github\.com\/settings\/developers/);

    // 2) 本机 setup：选 GitHub 保存（真实写盘，含 provider 字段）
    const setupPage = await raw(entry.port, { host: loopbackHost, path: '/pocket-setup' });
    const nonce = /<input type="hidden" name="nonce" value="([0-9a-f]+)">/.exec(setupPage.body)?.[1];
    assert.ok(nonce, '初始化页带 nonce');
    const save = await raw(entry.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        nonce,
        provider: 'github',
        client_id: 'gh-cid', client_secret: 'gh-sec',
        origins: `http://${loopbackHost}\nhttps://${tunnelHost}`,
      }).toString(),
    });
    assert.equal(save.status, 303);
    const onDisk = JSON.parse(await readFile(join(home, 'dsh-pocket', 'oauth.json'), 'utf8'));
    assert.equal(onDisk.provider, 'github', 'provider 真实落盘');
    assert.equal(onDisk.boundUid, null, '尚未绑定');

    // 3) 本机绑定：start 302 到 GitHub 授权端点（scope=read:user）→ callback 落 uid
    const bindStart = await raw(entry.port, { host: loopbackHost, path: '/pocket-oauth/start?bind=1' });
    assert.equal(bindStart.status, 302);
    const authorize = new URL(bindStart.location);
    assert.equal(authorize.origin + authorize.pathname, 'http://github.test/login/oauth/authorize');
    assert.equal(authorize.searchParams.get('scope'), 'read:user');
    const bindState = authorize.searchParams.get('state');
    const bindCb = await raw(entry.port, { host: loopbackHost, path: `/pocket-oauth/callback?code=c1&state=${bindState}` });
    assert.equal(bindCb.status, 200);
    assert.match(bindCb.body, /绑定成功/);
    assert.match(bindCb.body, /GitHub/);
    const bound = JSON.parse(await readFile(join(home, 'dsh-pocket', 'oauth.json'), 'utf8'));
    assert.equal(bound.boundUid, '8801', '绑定的 uid 落盘');
    assert.equal(bound.boundLogin, 'octocat');
    assert.equal(bound.provider, 'github');

    // 4) RPC 状态视图带 provider（设置页据此显示当前鉴权方）
    const status = await entry.call(POCKET_ENDPOINTS.status, {});
    assert.equal(status.value.oauth.provider, 'github');
    assert.equal(status.value.oauth.boundLogin, 'octocat');

    // 5) 隧道域名：登录页文案是 GitHub
    const loginWall = await raw(entry.port, { host: tunnelHost, headers: { accept: 'text/html' } });
    assert.equal(loginWall.status, 200);
    assert.match(loginWall.body, /使用 GitHub 账号登录/);

    // 6) 同账号登录：start → callback → 种会话 cookie（走真实 Bearer + api.github.com 桩路径）
    const start = await raw(entry.port, { host: tunnelHost, path: '/pocket-oauth/start' });
    assert.equal(start.status, 302);
    const startLoc = new URL(start.location);
    assert.equal(startLoc.searchParams.get('redirect_uri'), `https://${tunnelHost}/pocket-oauth/callback`);
    const state = startLoc.searchParams.get('state');
    const cb = await raw(entry.port, { host: tunnelHost, path: `/pocket-oauth/callback?code=c2&state=${state}` });
    assert.equal(cb.status, 303, 'GitHub 登录成功重定向回首页');
    const cookie = (Array.isArray(cb.setCookie) ? cb.setCookie.join('; ') : String(cb.setCookie ?? ''))
      .match(new RegExp(`${SESSION_COOKIE}=([0-9a-f]+)`))?.[1];
    assert.ok(cookie, '种下会话 cookie');

    // 7) 带 cookie 访问真实上游
    const authed = await raw(entry.port, { host: tunnelHost, path: '/api/session', headers: { cookie: `${SESSION_COOKIE}=${cookie}` } });
    assert.equal(authed.status, 200, '登录后可访问');
    assert.match(authed.body, /real-dsh-upstream/);

    // 8) 换另一个 GitHub 账号 → 被拒
    github.uid = '9999';
    github.login = 'mallory';
    const start2 = await raw(entry.port, { host: tunnelHost, path: '/pocket-oauth/start' });
    const state2 = new URL(start2.location).searchParams.get('state');
    const cb2 = await raw(entry.port, { host: tunnelHost, path: `/pocket-oauth/callback?code=c3&state=${state2}` });
    assert.equal(cb2.status, 403, '非绑定账号被拒');
    assert.match(cb2.body, /mallory/);
    assert.match(cb2.body, /GitHub/, '拒绝页文案按 provider');
    github.uid = '8801';
    github.login = 'octocat';

    // 9) 登出所有设备 → 旧 cookie 失效
    const rotated = await entry.call(POCKET_ENDPOINTS.oauthRotateSession, {});
    assert.equal(rotated.ok, true);
    const stale = await raw(entry.port, { host: tunnelHost, path: '/api/session', headers: { cookie: `${SESSION_COOKIE}=${cookie}`, accept: 'application/json' } });
    assert.equal(stale.status, 401, '轮换后旧会话失效');
  } finally {
    await entry.dispose();
    entry.restoreHome();
    await new Promise((r) => up.close(r));
    await rm(home, { recursive: true, force: true });
  }
});

/** 加载一份（可隔离的）插件入口模块：缓存击穿模拟「新进程加载」→ 新的模块级会话密钥。 */
async function loadEntry(tag) {
  const mod = tag ? await import(`../lib/index.js?proc=${tag}`) : await import('../lib/index.js');
  return mod.apply;
}

test('E2E：dsh web 重启（新进程）后旧会话 cookie 失效，需重新登录', async () => {
  const up = await fakeUpstream();
  const home = await mkdtemp(join(tmpdir(), 'dshp-e2e2-'));
  const gitee = { uid: '4242', login: 'alice' };
  const tunnelHost = 'pocket.example.com';

  // 第一次进程：本机绑定 + 隧道登录，拿到 cookie
  const first = await startEntry({ upstreamPort: up.address().port, dshHome: home, gitee, applyFn: await loadEntry('one') });
  const loopbackHost = `127.0.0.1:${first.port}`;
  let cookie;
  try {
    const page = await raw(first.port, { host: loopbackHost, path: '/pocket-setup' });
    const nonce = /<input type="hidden" name="nonce" value="([0-9a-f]+)">/.exec(page.body)?.[1];
    assert.ok(nonce, '初始化页带 nonce');
    await raw(first.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        nonce,
        client_id: 'cid', client_secret: 'sec',
        origins: `http://${loopbackHost}\nhttps://${tunnelHost}`,
      }).toString(),
    });
    const bindStart = await raw(first.port, { host: loopbackHost, path: '/pocket-oauth/start?bind=1' });
    const bindState = new URL(bindStart.location).searchParams.get('state');
    await raw(first.port, { host: loopbackHost, path: `/pocket-oauth/callback?code=c1&state=${bindState}` });

    const start = await raw(first.port, { host: tunnelHost, path: '/pocket-oauth/start' });
    const state = new URL(start.location).searchParams.get('state');
    const cb = await raw(first.port, { host: tunnelHost, path: `/pocket-oauth/callback?code=c2&state=${state}` });
    cookie = (Array.isArray(cb.setCookie) ? cb.setCookie.join('; ') : String(cb.setCookie ?? ''))
      .match(new RegExp(`${SESSION_COOKIE}=([0-9a-f]+)`))?.[1];
    assert.ok(cookie, '第一次进程登录成功');
  } finally {
    await first.dispose();
  }

  // 第二次进程（同一 DSH_HOME，独立模块实例 = 新的进程级会话密钥）：配置与绑定仍在，旧 cookie 失效
  const second = await startEntry({ upstreamPort: up.address().port, dshHome: home, gitee, applyFn: await loadEntry('two') });
  try {
    const status = await second.call(POCKET_ENDPOINTS.status, {});
    assert.equal(status.value.oauth.bound, true, '绑定信息跨重启保留（落盘）');
    const stale = await raw(second.port, { host: tunnelHost, path: '/api/session', headers: { cookie: `${SESSION_COOKIE}=${cookie}`, accept: 'application/json' } });
    assert.equal(stale.status, 401, '重启后旧 cookie 失效（会话密钥随进程变化）');
    const wall = await raw(second.port, { host: tunnelHost, headers: { accept: 'text/html' } });
    assert.match(wall.body, /使用 Gitee 账号登录/, '重新登录入口在');
  } finally {
    await second.dispose();
    second.restoreHome();
    await new Promise((r) => up.close(r));
    await rm(home, { recursive: true, force: true });
  }
});
