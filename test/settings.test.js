// 设置持久化测试（v3：settings.mjs 只剩 mobileRightbarEnabled / proxyPort / reset）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 每个测试用独立 DSH_HOME，互不干扰（settings.mjs 每次调用都读磁盘/环境变量）
async function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'dshp-settings-'));
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

test('手机端右边栏默认开启，可关闭并持久化', () => withHome(async () => {
  const { mobileRightbarEnabled, setMobileRightbarEnabled, settingsPath } = await import('../lib/settings.mjs');
  assert.equal(mobileRightbarEnabled(), true, '默认开启');
  assert.equal(setMobileRightbarEnabled(false), false, '返回关闭状态');
  assert.equal(mobileRightbarEnabled(), false, '关闭后立即生效');
  const raw = JSON.parse(readFileSync(settingsPath(), 'utf8'));
  assert.equal(raw.mobileRightbarEnabled, false, 'settings.json 内容正确');
  assert.equal(setMobileRightbarEnabled(true), true, '可再次开启');
  if (process.platform !== 'win32') {
    assert.equal(statSync(settingsPath()).mode & 0o777, 0o600, '权限 0600');
  }
}));

test('代理端口（issue #70）：默认 0（用 3081）；持久化、清除', () => withHome(async () => {
  const { proxyPort, setProxyPort, settingsPath } = await import('../lib/settings.mjs');
  assert.equal(proxyPort(), 0, '无配置 = 0（让 lib/index.js 用 3081）');
  assert.equal(setProxyPort(3082), 3082, '设置后立即返回新值');
  assert.equal(proxyPort(), 3082, '重新读取仍生效');
  const raw = JSON.parse(readFileSync(settingsPath(), 'utf8'));
  assert.equal(raw.proxyPort, 3082, 'settings.json 字段正确');
  assert.equal(setProxyPort(0), 0, '传 0 清除');
  assert.equal(proxyPort(), 0, '清除后回到默认');
  assert.equal(setProxyPort('garbage'), 0, '字符串非法值清除');
  assert.equal(setProxyPort(70000), 0, '超出 65535 清除');
  assert.equal(setProxyPort(-1), 0, '负数清除');
  assert.equal(setProxyPort(1.5), 0, '小数清除');
  assert.equal(setProxyPort(80), 80, '合法端口生效');
}));

test('恢复出厂设置：resetSettings 清空设置文件；resetPocketState 同时清 OAuth 配置', () => withHome(async () => {
  const settings = await import('../lib/settings.mjs');
  const oauth = await import('../lib/oauth.mjs');
  const { resetPocketState, rotateSessionKey } = await import('../lib/index.js');

  settings.setMobileRightbarEnabled(false);
  settings.setProxyPort(3099);
  oauth.writeOAuthConfig({
    clientId: 'cid', clientSecret: 'sec',
    callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice',
  });
  assert.equal(existsSync(settings.settingsPath()), true, '设置文件已写入');
  assert.equal(oauth.readOAuthConfig()?.clientSecret, 'sec', 'OAuth 配置已写入');

  const view = resetPocketState();
  assert.deepEqual(view, { provider: 'gitee', configured: false, callbackOrigins: [], bound: false, boundLogin: null }, '重置后视图回到未配置');
  assert.equal(existsSync(settings.settingsPath()), false, '设置文件已删除');
  assert.equal(oauth.readOAuthConfig(), null, 'OAuth 配置已清除');
  assert.equal(settings.mobileRightbarEnabled(), true, '开关回到默认');
  assert.equal(settings.proxyPort(), 0, '端口回到默认');
  assert.equal(rotateSessionKey(), true, '会话密钥同时轮换');
}));

test('绑定 / 解绑（lib/index.js）：bindOAuthUser 保留凭据落 uid+provider；unbindOAuthUser 只清绑定', () => withHome(async () => {
  const oauth = await import('../lib/oauth.mjs');
  const { bindOAuthUser, unbindOAuthUser } = await import('../lib/index.js');

  oauth.writeOAuthConfig({
    clientId: 'cid', clientSecret: 'sec',
    callbackOrigins: ['https://pocket.example.com'], boundUid: null, boundLogin: null,
  });
  bindOAuthUser({ id: 4242, login: 'alice' });
  let cfg = oauth.readOAuthConfig();
  assert.equal(cfg.boundUid, '4242', 'uid 落盘（数字归一字符串）');
  assert.equal(cfg.boundLogin, 'alice');
  assert.equal(cfg.provider, 'gitee', '缺省 provider 回退 gitee');
  assert.equal(cfg.clientSecret, 'sec', '凭据保留');

  // GitHub 绑定：provider 一并落盘（跨家撞号防护的前提）
  bindOAuthUser({ id: 4242, login: 'alice-gh', provider: 'github' });
  cfg = oauth.readOAuthConfig();
  assert.equal(cfg.provider, 'github', 'provider 落盘');
  assert.equal(cfg.boundLogin, 'alice-gh');

  const view = unbindOAuthUser();
  assert.equal(view.bound, false, '视图显示未绑定');
  assert.equal(view.provider, 'github', '解绑不动 provider');
  cfg = oauth.readOAuthConfig();
  assert.equal(cfg.boundUid, null, '绑定清除');
  assert.equal(cfg.clientId, 'cid', '凭据与白名单保留');
  assert.equal(cfg.provider, 'github', 'provider 保留');

  // 无配置时解绑不抛错
  oauth.clearOAuthConfig();
  const empty = unbindOAuthUser();
  assert.equal(empty.bound, false);
  assert.equal(empty.provider, 'gitee', '空视图给 gitee');
}));
