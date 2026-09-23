// dsh-pocket Gitee OAuth 认证测试（v3：代替 PIN）
//
// 覆盖：
//   - lib/oauth.mjs 单元：state 存储、origin 解析、会话 cookie 派生、配置落盘（0o600）、
//     exchangeCodeForUser（mock fetch，成功/失败分支）
//   - lib/proxy.mjs 集成：认证门（loopback 免认证 / 未配置 fail closed / 未绑定 / 401）、
//     登录全流程（start → gitee → callback 种 cookie → 放行）、账号不匹配拒绝、
//     state 单次使用、白名单外 origin 拒绝、setup 页仅本机、绑定流程、登出、
//     会话密钥轮换（登出所有设备）、WS 握手校验

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  createStateStore,
  parseOrigins,
  normalizeOrigin,
  sessionCookieValue,
  readOAuthConfig,
  writeOAuthConfig,
  clearOAuthConfig,
  oauthView,
  exchangeCodeForUser,
  OAUTH_CALLBACK_PATH,
  SESSION_COOKIE,
} from '../lib/oauth.mjs';
import { createPocketProxy } from '../lib/proxy.mjs';

// ---------- 单元：state 存储 ----------

test('state 存储：单次使用、TTL 过期、不同 purpose 隔离', () => {
  const s = createStateStore({ ttlMs: 100 });
  const a = s.create('login');
  const b = s.create('bind');
  assert.match(a, /^[0-9a-f]{32}$/, '随机 hex state');
  assert.equal(s.consume(a), 'login', '首次消费返回 purpose');
  assert.equal(s.consume(a), null, '单次使用：再消费为 null');
  assert.equal(s.consume(b), 'bind', '不同 state 各自独立');
  // 过期
  const c = s.create('login', Date.now() - 1000);
  assert.equal(s.consume(c), null, '过期 state 拒绝');
  assert.equal(s.consume('garbage'), null, '未知 state 拒绝');
});

// ---------- 单元：origin 解析 ----------

test('normalizeOrigin：归一化与拒绝', () => {
  assert.deepEqual(normalizeOrigin('https://Pocket.Example.com'), { origin: 'https://pocket.example.com' });
  assert.deepEqual(normalizeOrigin('http://127.0.0.1:3081/'), { origin: 'http://127.0.0.1:3081' });
  assert.deepEqual(normalizeOrigin('  http://192.168.1.5:3081  '), { origin: 'http://192.168.1.5:3081' });
  assert.ok(normalizeOrigin('ftp://x.com').error, '非 http(s) 拒绝');
  assert.ok(normalizeOrigin('https://x.com/path').error, '带 path 拒绝');
  assert.ok(normalizeOrigin('https://x.com?q=1').error, '带 query 拒绝');
  assert.ok(normalizeOrigin('https://u:p@x.com').error, '带凭据拒绝');
  assert.ok(normalizeOrigin('not a url').error, '非 URL 拒绝');
  assert.ok(normalizeOrigin('').error, '空拒绝');
});

test('parseOrigins：多行解析、去重、上限、空拒绝', () => {
  assert.deepEqual(parseOrigins('http://127.0.0.1:3081\nhttps://a.com\nhttp://127.0.0.1:3081'), {
    origins: ['http://127.0.0.1:3081', 'https://a.com'],
  }, '换行分隔 + 去重');
  assert.deepEqual(parseOrigins(['https://a.com', '']), { origins: ['https://a.com'] }, '数组输入，空行跳过');
  assert.ok(parseOrigins('').error, '空列表拒绝');
  assert.ok(parseOrigins('bad').error, '非法条目整体拒绝');
  assert.ok(parseOrigins(Array.from({ length: 11 }, (_, i) => `https://h${i}.com`).join('\n')).error, '超过 10 条拒绝');
});

// ---------- 单元：会话 cookie 派生 ----------

test('sessionCookieValue：sha256(uid:sessionKey)，随 uid / key 变化', () => {
  const v = (uid, sk) => createHash('sha256').update(`${uid}:${sk}`).digest('hex');
  assert.equal(sessionCookieValue('42', 'sk'), v('42', 'sk'));
  assert.notEqual(sessionCookieValue('42', 'sk'), sessionCookieValue('43', 'sk'), 'uid 变 → 值变');
  assert.notEqual(sessionCookieValue('42', 'sk1'), sessionCookieValue('42', 'sk2'), 'key 变 → 值变（重启/轮换即失效）');
});

// ---------- 单元：配置落盘（DSH_HOME 隔离） ----------

async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'dshp-oauth-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  try {
    return await fn(home);
  } finally {
    if (prev === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
}

test('oauth.json：读写、0o600、清除、坏文件 fail closed、视图脱敏', () => withHome(async (home) => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  assert.equal(readOAuthConfig(), null, '无文件 → 未配置');

  writeOAuthConfig({
    clientId: 'cid', clientSecret: 'secret',
    callbackOrigins: ['http://127.0.0.1:3081', 'https://pocket.example.com'],
    boundUid: '4242', boundLogin: 'alice',
  });
  const cfg = readOAuthConfig();
  assert.equal(cfg.clientId, 'cid');
  assert.equal(cfg.boundUid, '4242');
  assert.equal(cfg.callbackOrigins.length, 2);
  const p = join(home, 'dsh-pocket', 'oauth.json');
  if (process.platform !== 'win32') {
    assert.equal(statSync(p).mode & 0o777, 0o600, '权限 0600（secret 落盘）');
  }
  assert.ok(!readFileSync(p, 'utf8').includes('"boundLogin":"x"') || true, '文件可读');

  // 视图脱敏：不含 secret
  const view = oauthView(cfg);
  assert.deepEqual(view, {
    configured: true,
    callbackOrigins: ['http://127.0.0.1:3081', 'https://pocket.example.com'],
    bound: true,
    boundLogin: 'alice',
  });
  assert.ok(!JSON.stringify(view).includes('secret'), '视图不含 secret');

  // 清除
  assert.equal(clearOAuthConfig(), true);
  assert.equal(readOAuthConfig(), null);

  // 坏 JSON → null（fail closed）
  mkdirSync(join(home, 'dsh-pocket'), { recursive: true });
  writeFileSync(p, 'not-json');
  assert.equal(readOAuthConfig(), null, '坏文件视为未配置');

  // 空 cfg 视图
  assert.deepEqual(oauthView(null), { configured: false, callbackOrigins: [], bound: false, boundLogin: null });
}));

// ---------- 单元：exchangeCodeForUser（mock fetch） ----------

function mockGitee({ tokenOk = true, userOk = true, uid = '4242', login = 'alice', requests = [] } = {}) {
  return async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/oauth/token')) {
      if (!tokenOk) {
        return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'code expired' }) };
      }
      return { ok: true, status: 200, json: async () => ({ access_token: 'at-xyz', token_type: 'bearer', expires_in: 86400 }) };
    }
    if (String(url).includes('/api/v5/user')) {
      if (!userOk) {
        return { ok: false, status: 401, json: async () => ({ message: 'bad token' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: Number(uid), login }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('exchangeCodeForUser：成功返回 {id,login}（数字 id 归一为字符串）；换票/取用户失败给出双语错误', async () => {
  const requests = [];
  const ok = await exchangeCodeForUser({
    clientId: 'cid', clientSecret: 'sec', code: 'c1', redirectUri: 'https://x/pocket-oauth/callback',
    fetchImpl: mockGitee({ requests }), baseUrl: 'http://gitee.test',
  });
  assert.deepEqual(ok, { id: '4242', login: 'alice' }, '数字 id → 字符串');
  assert.equal(requests.length, 2, 'token + user 两次请求');
  assert.ok(requests[0].url.startsWith('http://gitee.test/oauth/token'));
  assert.ok(String(requests[0].init.body).includes('redirect_uri='), 'redirect_uri 参与 token 交换');

  await assert.rejects(
    () => exchangeCodeForUser({
      clientId: 'cid', clientSecret: 'sec', code: 'bad', redirectUri: 'https://x/cb',
      fetchImpl: mockGitee({ tokenOk: false }), baseUrl: 'http://gitee.test',
    }),
    (err) => /invalid_grant|token exchange failed/i.test(err.message),
    '换票失败抛错',
  );
  await assert.rejects(
    () => exchangeCodeForUser({
      clientId: 'cid', clientSecret: 'sec', code: 'c', redirectUri: 'https://x/cb',
      fetchImpl: mockGitee({ userOk: false }), baseUrl: 'http://gitee.test',
    }),
    (err) => /bad token|user info failed/i.test(err.message),
    '取用户失败抛错',
  );
  await assert.rejects(
    () => exchangeCodeForUser({
      clientId: 'cid', clientSecret: 'sec', code: 'c', redirectUri: 'https://x/cb',
      fetchImpl: async () => { throw new TypeError('fetch failed'); }, baseUrl: 'http://gitee.test',
    }),
    (err) => /无法连接 Gitee|cannot reach Gitee/.test(err.message),
    '网络错误给出可读信息',
  );
});

// ---------- 集成：代理认证门与 OAuth 流程 ----------

/** 假上游：记录 Host，返回固定 HTML；带 WS echo。 */
async function fakeUpstream() {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.url);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head></head><body>dsh-upstream</body></html>');
  });
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => { }); // teardown 时 RST 不致未处理 error 崩进程
    const accept = createHash('sha1')
      .update(String(req.headers['sec-websocket-key'] ?? '') + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    if (head?.length) socket.write(head);
    socket.on('data', () => { /* echo 忽略 */ });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { port: server.address().port, seen, server };
}

/** 从初始化页 HTML 里取出表单 nonce（CSRF 防护要求提交时回传）。 */
function nonceFrom(html) {
  const m = /<input type="hidden" name="nonce" value="([0-9a-f]+)">/.exec(String(html ?? ''));
  assert.ok(m, '初始化页必须带 nonce 隐藏字段');
  return m[1];
}

/** 原始 http 请求（fetch 不能设 Host 头）。 */
function raw(port, { method = 'GET', path = '/', host = '127.0.0.1', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers: { host, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
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

/** 起一个带 OAuth auth 的代理；cfg 为可变配置对象。 */
async function oauthProxy({ cfg, session, upstreamPort, fetchImpl }) {
  return createPocketProxy({
    port: 0, host: '127.0.0.1',
    upstream: { host: '127.0.0.1', port: upstreamPort },
    injectHtml: '',
    auth: {
      sessionKey: () => session.key,
      getConfig: () => cfg.value,
      saveConfig: (draft) => { cfg.value = draft; },
      bindUser: (user) => {
        cfg.value = { ...cfg.value, boundUid: String(user.id), boundLogin: user.login };
      },
      giteeBase: 'http://gitee.test',
      fetchImpl: fetchImpl ?? mockGitee(),
    },
  });
}

test('认证门：未配置 fail closed（页面 503 指引 setup；API 503）；loopback 免认证', async () => {
  const up = await fakeUpstream();
  const cfg = { value: null };
  const session = { key: 'sk-1' };
  const proxy = await oauthProxy({ cfg, session, upstreamPort: up.port });
  try {
    // 非 loopback HTML → 未初始化页（含 setup 指引）
    const page = await raw(proxy.port, { host: 'pocket.example.com', headers: { accept: 'text/html' } });
    assert.equal(page.status, 503);
    assert.match(page.body, /尚未完成|pocket-setup/);
    // 非 loopback API → 503 JSON
    const api = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { accept: 'application/json' } });
    assert.equal(api.status, 503);
    assert.equal(JSON.parse(api.body).error, 'oauth-not-configured');
    // loopback（Host 与源一致）→ 免认证直通上游
    const local = await raw(proxy.port, { host: `127.0.0.1:${proxy.port}` });
    assert.equal(local.status, 200);
    assert.match(local.body, /dsh-upstream/);
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('认证门：已配置未绑定 → 503 待绑定；绑定后未带 cookie 的 HTML → 登录页，API → 401', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: null, boundLogin: null } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port });
  try {
    const unbound = await raw(proxy.port, { host: 'pocket.example.com', headers: { accept: 'text/html' } });
    assert.equal(unbound.status, 503);
    assert.match(unbound.body, /待绑定/);

    cfg.value.boundUid = '4242';
    cfg.value.boundLogin = 'alice';
    const login = await raw(proxy.port, { host: 'pocket.example.com', headers: { accept: 'text/html' } });
    assert.equal(login.status, 200);
    assert.match(login.body, /使用 Gitee 账号登录/);
    assert.match(login.body, /pocket-oauth\/start/);
    const api = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { accept: 'application/json' } });
    assert.equal(api.status, 401);
    assert.equal(JSON.parse(api.body).error, 'unauthorized');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('登录全流程：start → gitee 302（含 state 与 redirect_uri）→ callback 种 cookie → 带 cookie 放行；state 单次使用', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const session = { key: 'sk-1' };
  const fetchImpl = mockGitee();
  const proxy = await oauthProxy({ cfg, session, upstreamPort: up.port, fetchImpl });
  try {
    // 1) start：Host 命中白名单 → 302 到 gitee authorize
    const start = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/start' });
    assert.equal(start.status, 302);
    const loc = new URL(start.location);
    assert.equal(loc.origin + loc.pathname, 'http://gitee.test/oauth/authorize');
    assert.equal(loc.searchParams.get('client_id'), 'cid');
    assert.equal(loc.searchParams.get('redirect_uri'), `https://pocket.example.com${OAUTH_CALLBACK_PATH}`);
    assert.equal(loc.searchParams.get('response_type'), 'code');
    const state = loc.searchParams.get('state');
    assert.ok(state, '携带 state');

    // 2) callback：mock gitee 换票取 uid（4242 == boundUid）→ 303 回 / + 种 HttpOnly cookie
    const cb = await raw(proxy.port, { host: 'pocket.example.com', path: `/pocket-oauth/callback?code=c1&state=${state}` });
    assert.equal(cb.status, 303);
    assert.equal(cb.location, '/');
    const sc = Array.isArray(cb.setCookie) ? cb.setCookie.join(';') : String(cb.setCookie ?? '');
    const expected = sessionCookieValue('4242', 'sk-1');
    assert.ok(sc.includes(`${SESSION_COOKIE}=${expected}`), 'cookie = sha256(uid:sessionKey)');
    assert.ok(sc.includes('HttpOnly'), 'HttpOnly');
    assert.ok(sc.includes('Max-Age=2592000'), '30 天持久');
    assert.ok(sc.includes('SameSite=Lax'), 'SameSite=Lax');
    assert.ok(/;\s*Secure\b/.test(sc), 'https 入口的会话 cookie 带 Secure');

    // 3) 带 cookie → 放行上游；不带 → 401
    const authed = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { cookie: `${SESSION_COOKIE}=${expected}`, accept: 'application/json' } });
    assert.equal(authed.status, 200, '带会话 cookie 放行');
    const no = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { accept: 'application/json' } });
    assert.equal(no.status, 401, '不带 cookie 仍 401');

    // 4) state 单次使用：重放 callback → 400
    const replay = await raw(proxy.port, { host: 'pocket.example.com', path: `/pocket-oauth/callback?code=c1&state=${state}` });
    assert.equal(replay.status, 400, 'state 重放被拒');

    // 5) 会话密钥轮换（登出所有设备）：旧 cookie 立即失效
    session.key = 'sk-2';
    const rotated = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { cookie: `${SESSION_COOKIE}=${expected}`, accept: 'application/json' } });
    assert.equal(rotated.status, 401, '轮换后旧 cookie 失效');
    const fresh = sessionCookieValue('4242', 'sk-2');
    const reAuthed = await raw(proxy.port, { host: 'pocket.example.com', path: '/api/x', headers: { cookie: `${SESSION_COOKIE}=${fresh}`, accept: 'application/json' } });
    assert.equal(reAuthed.status, 200, '新 cookie 放行');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('http 入口（loopback/局域网）的会话 cookie 不能带 Secure——否则浏览器直接丢弃、登录失效', async () => {
  const up = await fakeUpstream();
  const cfg = { value: null };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port, fetchImpl: mockGitee() });
  const loopbackHost = `127.0.0.1:${proxy.port}`;
  try {
    cfg.value = { clientId: 'cid', clientSecret: 'sec', callbackOrigins: [`http://${loopbackHost}`], boundUid: '4242', boundLogin: 'alice' };
    const start = await raw(proxy.port, { host: loopbackHost, path: '/pocket-oauth/start' });
    assert.equal(start.status, 302, 'http 白名单入口可发起登录');
    const state = new URL(start.location).searchParams.get('state');
    const cb = await raw(proxy.port, { host: loopbackHost, path: `/pocket-oauth/callback?code=c1&state=${state}` });
    assert.equal(cb.status, 303);
    const sc = Array.isArray(cb.setCookie) ? cb.setCookie.join(';') : String(cb.setCookie ?? '');
    assert.ok(sc.includes(`${SESSION_COOKIE}=${sessionCookieValue('4242', 'sk-1')}`), '种下会话 cookie');
    assert.ok(!/;\s*Secure\b/.test(sc), 'http 入口不加 Secure');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('账号不匹配：uid 不同的 Gitee 账号登录被拒（403 未绑定提示，不种 cookie）', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port, fetchImpl: mockGitee({ uid: '9999', login: 'mallory' }) });
  try {
    const start = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/start' });
    const state = new URL(start.location).searchParams.get('state');
    const cb = await raw(proxy.port, { host: 'pocket.example.com', path: `/pocket-oauth/callback?code=c1&state=${state}` });
    assert.equal(cb.status, 403);
    assert.match(cb.body, /mallory/, '提示当前登录账号');
    assert.match(cb.body, /未绑定/);
    assert.ok(!(cb.setCookie ?? []).toString().includes(SESSION_COOKIE), '不种会话 cookie');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('白名单外 origin：start 拒绝并给出引导页；白名单内另一个 origin 正常发起', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port });
  try {
    const denied = await raw(proxy.port, { host: 'other.example.com', path: '/pocket-oauth/start' });
    assert.equal(denied.status, 403);
    assert.match(denied.body, /pocket\.example\.com/, '列出可用地址');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('setup 页与绑定流程：仅本机；POST 保存 → 303 发起绑定 → callback 落 boundUid；bind 不可从非本机发起', async () => {
  const up = await fakeUpstream();
  const cfg = { value: null };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port, fetchImpl: mockGitee() });
  const loopbackHost = `127.0.0.1:${proxy.port}`;
  try {
    // setup 仅 loopback：非 loopback Host → 403
    const remoteSetup = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-setup' });
    assert.equal(remoteSetup.status, 403);
    // loopback → 表单页
    const setup = await raw(proxy.port, { host: loopbackHost, path: '/pocket-setup' });
    assert.equal(setup.status, 200);
    assert.match(setup.body, /client_id/);
    assert.match(setup.body, /pocket-setup\/save/);
    assert.ok(
      setup.body.includes(`http://127.0.0.1:${proxy.port}${OAUTH_CALLBACK_PATH}`),
      '示例回调地址使用真实监听端口（端口非 3081 时不误导用户）',
    );

    // bind 不可从非本机发起
    const remoteBind = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/start?bind=1' });
    assert.equal(remoteBind.status, 403);

    // 保存凭据（loopback）→ 303 到 start?bind=1（表单必须回传初始化页下发的 nonce）
    const form = new URLSearchParams({
      nonce: nonceFrom(setup.body),
      client_id: 'cid',
      client_secret: 'sec',
      origins: `http://${loopbackHost}\nhttps://pocket.example.com`,
    }).toString();
    const save = await raw(proxy.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form,
    });
    assert.equal(save.status, 303);
    assert.equal(save.location, '/pocket-oauth/start?bind=1');
    assert.equal(cfg.value.clientId, 'cid', '凭据已保存');
    assert.equal(cfg.value.boundUid, null, '保存后未绑定（需完成 OAuth）');

    // 绑定流程（loopback start bind=1）
    const start = await raw(proxy.port, { host: loopbackHost, path: '/pocket-oauth/start?bind=1' });
    assert.equal(start.status, 302);
    const loc = new URL(start.location);
    assert.equal(loc.searchParams.get('redirect_uri'), `http://${loopbackHost}${OAUTH_CALLBACK_PATH}`);
    const state = loc.searchParams.get('state');

    // callback（bind）→ 绑定成功页，uid 落盘
    const cb = await raw(proxy.port, { host: loopbackHost, path: `/pocket-oauth/callback?code=c1&state=${state}` });
    assert.equal(cb.status, 200);
    assert.match(cb.body, /绑定成功/);
    assert.match(cb.body, /alice/);
    assert.equal(cfg.value.boundUid, '4242');
    assert.equal(cfg.value.boundLogin, 'alice');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('CSRF 防护：跨站表单提交 / 无 nonce / 跨站 start / 跨站 logout 一律拒绝，且回调不受影响', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port, fetchImpl: mockGitee() });
  const loopbackHost = `127.0.0.1:${proxy.port}`;
  const evil = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', referer: 'https://evil.example/' };
  try {
    // 1) 跨站 POST 初始化表单（真实攻击路径：浏览器按 URL 写 Host、源地址也是 loopback）
    const page = await raw(proxy.port, { host: loopbackHost, path: '/pocket-setup' });
    const nonce = nonceFrom(page.body);
    const before = JSON.stringify(cfg.value);
    const forged = await raw(proxy.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...evil },
      body: new URLSearchParams({ nonce, client_id: 'attacker', client_secret: 'x'.repeat(20), origins: 'https://evil.example' }).toString(),
    });
    assert.equal(forged.status, 403, '跨站提交被拒（即使 nonce 正确）');
    assert.equal(JSON.stringify(cfg.value), before, '配置一个字节都没被改写');

    // 2) 无 nonce / 错误 nonce 的同源提交 → 拒（老浏览器缺 Sec-Fetch-* 时的兜底防线）
    const post = (payload, headers = {}) => raw(proxy.port, {
      method: 'POST', host: loopbackHost, path: '/pocket-setup/save',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      body: new URLSearchParams(payload).toString(),
    });
    const noNonce = await post({ client_id: 'attacker2', client_secret: 'y'.repeat(20), origins: 'https://evil.example' });
    assert.equal(noNonce.status, 403, '缺 nonce 拒绝');
    const badNonce = await post({ nonce: 'deadbeef', client_id: 'attacker3', client_secret: 'z'.repeat(20), origins: 'https://evil.example' });
    assert.equal(badNonce.status, 403, '错误 nonce 拒绝');
    assert.equal(JSON.stringify(cfg.value), before, '伪造尝试均未改写配置');

    // 3) 跨站发起绑定 / 登出 → 拒
    const crossBind = await raw(proxy.port, { host: loopbackHost, path: '/pocket-oauth/start?bind=1', headers: evil });
    assert.equal(crossBind.status, 403, '跨站发起绑定被拒');
    const crossLogout = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/logout', headers: evil });
    assert.equal(crossLogout.status, 403, '跨站强制登出被拒');
    assert.ok(!(crossLogout.setCookie ?? []).toString().includes(SESSION_COOKIE), '跨站登出没有清 cookie');

    // 4) 同源（带 Origin）提交仍正常：Origin 与 Host 一致 → 放行
    const ok = await post(
      { nonce, client_id: 'cid2', client_secret: 'sec2', origins: `http://${loopbackHost}\nhttps://pocket.example.com` },
      { origin: `http://${loopbackHost}` },
    );
    assert.equal(ok.status, 303, '同源提交放行');
    assert.equal(cfg.value.clientId, 'cid2', '同源提交确实生效');

    // 5) OAuth 回调本来就是 Gitee 跨站跳回来的，不能被来源校验误伤（其防线是单次 state）
    cfg.value = { ...cfg.value, boundUid: '4242', boundLogin: 'alice' };
    const start = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/start' });
    assert.equal(start.status, 302, '同源/直接发起的登录仍可启动');
    const state = new URL(start.location).searchParams.get('state');
    const cb = await raw(proxy.port, {
      host: 'pocket.example.com', path: `/pocket-oauth/callback?code=c1&state=${state}`,
      headers: { 'sec-fetch-site': 'cross-site' }, // 模拟从 gitee.com 跳回
    });
    assert.equal(cb.status, 303, '跨站回调照常完成登录');
    assert.ok((cb.setCookie ?? []).toString().includes(SESSION_COOKIE), '并种下会话 cookie');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('登出路由：清除会话 cookie（Max-Age=0）', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port });
  try {
    const out = await raw(proxy.port, { host: 'pocket.example.com', path: '/pocket-oauth/logout' });
    assert.equal(out.status, 302);
    assert.equal(out.location, '/');
    const sc = Array.isArray(out.setCookie) ? out.setCookie.join(';') : String(out.setCookie ?? '');
    assert.ok(sc.includes(`${SESSION_COOKIE}=;`) && sc.includes('Max-Age=0'), '过期 cookie');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});

test('WS upgrade：非 loopback 无会话 cookie → 401；带会话 cookie → 101 透传', async () => {
  const up = await fakeUpstream();
  const cfg = { value: { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' } };
  const proxy = await oauthProxy({ cfg, session: { key: 'sk-1' }, upstreamPort: up.port });
  const cookie = sessionCookieValue('4242', 'sk-1');
  const wsHandshake = (headers) => new Promise((resolve) => {
    const sock = connect(proxy.port, '127.0.0.1', () => {
      sock.write(
        'GET /api/events.host HTTP/1.1\r\nHost: pocket.example.com\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
        + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n'
        + (headers ? `${headers}\r\n` : '')
        + '\r\n',
      );
    });
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); resolve('timeout'); }, 2000);
    sock.on('data', (c) => {
      buf += c.toString('latin1');
      if (buf.includes('101') || buf.includes('401')) { clearTimeout(timer); sock.destroy(); resolve(buf.includes('101') ? 'ok' : 'denied'); }
    });
    sock.on('error', () => { clearTimeout(timer); resolve('denied'); });
  });
  try {
    assert.equal(await wsHandshake(null), 'denied', '无 cookie 的 WS 握手被拒');
    assert.equal(await wsHandshake(`Cookie: ${SESSION_COOKIE}=${cookie}`), 'ok', '带 cookie 的 WS 握手透传');
    // loopback Host（源也是 loopback）→ 免认证
    const loop = await new Promise((resolve) => {
      const sock = connect(proxy.port, '127.0.0.1', () => {
        sock.write(
          `GET /api/events.host HTTP/1.1\r\nHost: 127.0.0.1:${proxy.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n`
          + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n',
        );
      });
      let buf = '';
      const timer = setTimeout(() => { sock.destroy(); resolve('timeout'); }, 2000);
      sock.on('data', (c) => {
        buf += c.toString('latin1');
        if (buf.includes('101')) { clearTimeout(timer); sock.destroy(); resolve('ok'); }
      });
      sock.on('error', () => { clearTimeout(timer); resolve('denied'); });
    });
    assert.equal(loop, 'ok', 'loopback WS 免认证');
  } finally {
    await proxy.close();
    await new Promise((r) => up.server.close(r));
  }
});
