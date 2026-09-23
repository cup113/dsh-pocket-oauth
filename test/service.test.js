// dsh-pocket 服务层测试：代理生命周期、状态快照（OAuth 视图 + 二维码）、RPC 基础面
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPocketService, selectLanIPv4 } from '../lib/service.mjs';
import { installPocketRpc } from '../lib/web-rpc.js';
import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS } from '../client/api.js';

function stubInternals() {
  return {
    createProxy: async ({ port }) => ({ port, close: async () => {} }),
    lanCandidates: async () => ['192.168.1.50', '100.119.24.44'],
    encodeQr: async (text) => `data:qr;${text}`,
  };
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

// ---------- selectLanIPv4（网卡评分） ----------

test('selectLanIPv4：排在前面的 Radmin VPN 不遮蔽 WLAN 私网地址', () => {
  const ip = selectLanIPv4({
    'Radmin VPN': [{ family: 'IPv4', address: '26.26.26.1', internal: false }],
    WLAN: [{ family: 'IPv4', address: '192.168.1.50', internal: false }],
  });
  assert.equal(ip, '192.168.1.50');
});

test('selectLanIPv4：两张私网网卡时优先名称像物理网卡的接口', () => {
  const ip = selectLanIPv4({
    vEthernet: [{ family: 'IPv4', address: '192.168.137.1', internal: false }],
    '以太网': [{ family: 'IPv4', address: '10.0.0.5', internal: false }],
  });
  assert.equal(ip, '10.0.0.5');
});

test('selectLanIPv4（issue #43）：Easytier 网卡不遮蔽改名后的物理网卡', () => {
  const ip = selectLanIPv4({
    easytier0: [{ family: 'IPv4', address: '10.126.126.5', internal: false }],
    'Wi-Fi 6': [{ family: 'IPv4', address: '192.168.2.30', internal: false }],
  });
  assert.equal(ip, '192.168.2.30');
});

test('selectLanIPv4：没有私网地址时回退到非回环地址（纯 VPN 环境仍可用）', () => {
  const ip = selectLanIPv4({
    'Radmin VPN': [{ family: 'IPv4', address: '26.26.26.9', internal: false }],
  });
  assert.equal(ip, '26.26.26.9');
});

test('selectLanIPv4：空接口表返回 null', () => {
  assert.equal(selectLanIPv4({}), null);
});

// ---------- service：代理生命周期与状态快照 ----------

test('service：startProxy → 状态快照（OAuth 视图 + origin 二维码 + LAN 候选）', async () => {
  const internals = stubInternals();
  const cfg = {
    clientId: 'cid', clientSecret: 'sec',
    callbackOrigins: ['https://pocket.example.com', 'http://127.0.0.1:3081'],
    boundUid: '4242', boundLogin: 'alice',
  };
  const service = createPocketService({ dshPort: 3080, port: 3081, internals, getOAuthConfig: () => cfg });

  const before = await service.status();
  assert.equal(before.proxyRunning, false);
  assert.deepEqual(before.oauth, { configured: true, callbackOrigins: cfg.callbackOrigins, bound: true, boundLogin: 'alice' });

  const proxy = await service.startProxy();
  assert.equal(proxy.port, 3081);
  const st = await service.status();
  assert.equal(st.proxyRunning, true);
  assert.equal(st.proxyPort, 3081);
  assert.equal(st.dshPort, 3080);
  assert.deepEqual(st.lanCandidates, ['192.168.1.50', '100.119.24.44'], '候选包含 Tailscale IP');
  assert.deepEqual(
    st.originQrs.map((o) => o.origin),
    ['https://pocket.example.com', 'http://127.0.0.1:3081'],
    '每个白名单 origin 一条二维码记录',
  );
  assert.equal(st.originQrs[0].qr, 'data:qr;https://pocket.example.com');

  await service.dispose();
  const after = await service.status();
  assert.equal(after.proxyRunning, false, 'dispose 后代理状态复位');
});

test('service：未配置 OAuth 时状态给出安全视图（不抛错）', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals, getOAuthConfig: () => null });
  await service.startProxy();
  const st = await service.status();
  assert.deepEqual(st.oauth, { configured: false, callbackOrigins: [], bound: false, boundLogin: null });
  assert.deepEqual(st.originQrs, []);
  await service.dispose();
});

test('startProxy：端口被占（EADDRINUSE）时自动尝试下一个端口', async () => {
  let attempts = 0;
  const internals = {
    ...stubInternals(),
    createProxy: async ({ port: p }) => {
      attempts += 1;
      if (attempts === 1) {
        const e = new Error('address in use');
        e.code = 'EADDRINUSE';
        throw e;
      }
      return { port: p, close: async () => {} };
    },
  };
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const proxy = await service.startProxy();
  assert.equal(attempts, 2, '第一个端口失败后重试');
  assert.equal(proxy.port, 3082, '自动换到下一个端口');
  const st = await service.status();
  assert.equal(st.proxyRunning, true);
  assert.equal(st.proxyPort, 3082, '状态使用实际端口');
  await service.dispose();
});

// ---------- RPC 基础面 ----------

test('RPC：status（含 OAuth 视图）/ 未知端点', async () => {
  const internals = stubInternals();
  const cfg = { clientId: 'cid', clientSecret: 'sec', callbackOrigins: ['https://pocket.example.com'], boundUid: '4242', boundLogin: 'alice' };
  const service = createPocketService({ dshPort: 3080, port: 3081, internals, getOAuthConfig: () => cfg });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    getOAuthView: () => ({ configured: true, callbackOrigins: ['https://pocket.example.com'], bound: true, boundLogin: 'alice' }),
    setMobileRightbarEnabled: (on) => on,
    log: { error() {}, warn() {} },
  });

  await service.startProxy();

  const s1 = await conn.handler(POCKET_ENDPOINTS.status, {});
  assert.equal(s1.ok, true);
  assert.equal(s1.value.proxyRunning, true);
  assert.equal(s1.value.restartNotice, null, '无重启标记时 restartNotice 为 null');
  assert.equal(s1.value.oauth.boundLogin, 'alice', 'status 携带 OAuth 视图');
  assert.ok(!JSON.stringify(s1.value).includes('sec'), 'status 不泄露 secret');

  const unknown = await conn.handler('nope', {});
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'bad-request');

  await service.dispose();
});

test('RPC：oauth.rotateSession / oauth.unbind', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals, getOAuthConfig: () => null });
  const conn = fakeCtxConnection();
  let rotated = 0;
  let unbound = null;
  installPocketRpc({ connection: conn }, {
    service,
    rotateSession: () => { rotated += 1; },
    unbindOAuth: () => { unbound = { configured: true, callbackOrigins: [], bound: false, boundLogin: null }; return unbound; },
    log: { error() {}, warn() {} },
  });

  const r = await conn.handler(POCKET_ENDPOINTS.oauthRotateSession, {});
  assert.equal(r.ok, true);
  assert.equal(rotated, 1, '轮换被调用');

  const u = await conn.handler(POCKET_ENDPOINTS.oauthUnbind, {});
  assert.equal(u.ok, true);
  assert.deepEqual(u.value.oauth, unbound, '解绑返回安全视图');

  const missing = await conn.handler(POCKET_ENDPOINTS.oauthRotateSession, {});
  // rotateSession 已提供 → ok；再测未提供时的失败分支
  const conn2 = fakeCtxConnection();
  installPocketRpc({ connection: conn2 }, { service, log: { error() {}, warn() {} } });
  const denied = await conn2.handler(POCKET_ENDPOINTS.oauthRotateSession, {});
  assert.equal(denied.ok, false, '未提供回调 → bad-request');

  await service.dispose();
});

test('RPC：mobile.rightbar.setEnabled 默认开启并回写到 status', async () => {
  const internals = stubInternals();
  let enabled = true;
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    setMobileRightbarEnabled: (on) => { enabled = on === true; return enabled; },
    log: { error() {}, warn() {} },
  });

  const initial = await conn.handler(POCKET_ENDPOINTS.status, {});
  assert.equal(initial.ok, true);
  assert.equal(initial.value.mobileRightbarEnabled, true, '默认开启');

  const off = await conn.handler(POCKET_ENDPOINTS.mobileRightbarSetEnabled, { on: false });
  assert.equal(off.ok, true);
  assert.equal(off.value.mobileRightbarEnabled, false, '关闭成功');

  const on = await conn.handler(POCKET_ENDPOINTS.mobileRightbarSetEnabled, { on: true });
  assert.equal(on.ok, true);
  assert.equal(on.value.mobileRightbarEnabled, true, '可再次开启');

  await service.dispose();
});

test('RPC：status 携带重启提示（restartNotice）', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    restartNotice: () => ({ at: Date.now(), pid: 12345 }),
    log: { error() {}, warn() {} },
  });

  const s = await conn.handler(POCKET_ENDPOINTS.status, {});
  assert.equal(s.ok, true);
  assert.equal(s.value.restartNotice.pid, 12345, '重启标记随 status 返回');

  await service.dispose();
});

test('RPC：restartNotice 读取抛错时 status 优雅降级为 null', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    restartNotice: async () => { throw new Error('ENOENT'); },
    log: { error() {}, warn() {} },
  });
  await service.startProxy();
  const s = await conn.handler(POCKET_ENDPOINTS.status, {});
  assert.equal(s.ok, true);
  assert.equal(s.value.restartNotice, null, '读取失败不阻塞 status');
  await service.dispose();
});

test('RPC：pocket.reset 需要显式确认', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    resetPocket: () => { throw new Error('should not be called without confirm'); },
    log: { error() {}, warn() {} },
  });
  const denied = await conn.handler(POCKET_ENDPOINTS.pocketReset, {});
  assert.equal(denied.ok, false, '未确认 → 拒绝');
  assert.match(denied.error.message, /确认/);
  await service.dispose();
});

test('RPC：version 返回磁盘版本 current 与启动版本 loaded', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    runUpdate: { currentVersion: () => '1.0.15', loadedVersion: () => '1.0.14', perform: async () => ({ ok: true }) },
    log: { error() {}, warn() {} },
  });

  const v = await conn.handler(POCKET_ENDPOINTS.version, {});
  assert.equal(v.ok, true);
  assert.equal(v.value.current, '1.0.15', 'current 是磁盘实时版本');
  assert.equal(v.value.loaded, '1.0.14', 'loaded 是进程启动版本');

  await service.dispose();
});

// ---------- 重启（lib/restart.js，与代理无关） ----------

test('自重启：restartHost 用 detached 辅助进程交接，旧进程随后退出', async () => {
  const { restartHost } = await import('../lib/restart.js');
  const calls = [];
  const result = restartHost({
    internals: {
      spawn: (file, args, opts) => { calls.push({ file, args, detached: opts?.detached }); return { pid: 4242, unref: () => {} }; },
      kill: (pid) => calls.push('kill:' + pid),
    },
  });
  assert.equal(result.helperPid, 4242, '返回辅助进程 pid');
  assert.ok(result.logOut.endsWith('.out.log'), '输出日志路径');
  assert.ok(result.logErr.endsWith('.err.log'), '错误日志路径');
  assert.equal(calls.length, 1, '只拉起一个辅助进程');
  const helper = calls[0];
  assert.equal(helper.file, process.execPath, '用 node 拉起辅助进程');
  assert.equal(helper.args[0], '-e');
  assert.equal(helper.detached, true, '辅助进程 detached');
  const code = helper.args[1];
  assert.ok(code.includes(JSON.stringify(process.argv[0])), '辅助代码含 node 路径');
  assert.ok(code.includes('waitPort'), '辅助代码含端口释放探测（替代固定延时）');
  assert.ok(code.includes('setTimeout'), '辅助代码含轮询延时');
  // helper 代码必须是可执行的有效 JS（防拼接语法错误 → 重启静默失败）
  const vm = await import('node:vm');
  try {
    vm.compileFunction(code, [], { filename: 'restart-helper.js' });
  } catch (e) {
    assert.fail('helper 代码语法错误: ' + e.message);
  }
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(calls.some((c) => typeof c === 'string' && c.startsWith('kill:')), '短暂等待后旧进程退出');
});

test('dshPortFromArgs：--port / -p / --port= 三种形式', async () => {
  const { dshPortFromArgs } = await import('../lib/restart.js');
  assert.equal(dshPortFromArgs(['web']), 3080, '默认 3080');
  assert.equal(dshPortFromArgs(['web', '--port', '3099']), 3099);
  assert.equal(dshPortFromArgs(['web', '-p', '3100']), 3100);
  assert.equal(dshPortFromArgs(['web', '--port=3111']), 3111, '--port= 形式');
  assert.equal(dshPortFromArgs(['web', '--port', 'abc']), 3080, '非法值回退默认');
});

test('自重启失败：spawn 抛错 → 返回 helperPid:null 和错误', async () => {
  const { restartHost } = await import('../lib/restart.js');
  const result = restartHost({
    internals: {
      spawn: () => { throw new Error('boom'); },
      kill: () => {},
    },
  });
  assert.equal(result.helperPid, null);
  assert.match(result.error, /boom/);
});

// ---------- 重启标记（lib/index.js，真实文件系统） ----------

test('readRestartNotice：真实文件系统（无文件/坏 JSON/过期/有效）', async () => {
  const os = await import('node:os');
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  const { readRestartNotice } = await import('../lib/index.js');

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-pocket-test-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    assert.equal(await readRestartNotice(), null, '无标记文件返回 null');
    await fsp.mkdir(path.join(dir, 'dsh-pocket'), { recursive: true });
    await fsp.writeFile(path.join(dir, 'dsh-pocket', 'restarted.json'), 'not-json');
    assert.equal(await readRestartNotice(), null, '坏 JSON 返回 null');
    await fsp.writeFile(path.join(dir, 'dsh-pocket', 'restarted.json'), JSON.stringify({ at: Date.now() - 31 * 60 * 1000, pid: 1 }));
    assert.equal(await readRestartNotice(), null, '过期标记返回 null');
    await fsp.writeFile(path.join(dir, 'dsh-pocket', 'restarted.json'), JSON.stringify({ at: Date.now(), pid: 4242 }));
    const n = await readRestartNotice();
    assert.equal(n.pid, 4242, '有效标记返回 pid');
  } finally {
    process.env.DSH_HOME = prev;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('consumeRestartNotice：读后即删（横幅只显示一次，不会一直出现）', async () => {
  const os = await import('node:os');
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  const { consumeRestartNotice } = await import('../lib/index.js');

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-pocket-consume-'));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = dir;
  try {
    const noticePath = path.join(dir, 'dsh-pocket', 'restarted.json');
    await fsp.mkdir(path.dirname(noticePath), { recursive: true });
    await fsp.writeFile(noticePath, JSON.stringify({ at: Date.now(), pid: 4242 }));
    const n1 = await consumeRestartNotice();
    assert.equal(n1.pid, 4242, '第一次消费返回标记');
    await assert.rejects(fsp.access(noticePath), '文件已删除');
    const n2 = await consumeRestartNotice();
    assert.equal(n2, null, '消费后不再返回');
  } finally {
    process.env.DSH_HOME = prev;
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

// ---------- 模块加载与桌面端 ----------

test('lib/index.js 模块可加载，apply 可调用（防模块级 ReferenceError 回归）', async () => {
  const mod = await import('../lib/index.js');
  assert.equal(typeof mod.apply, 'function');
  assert.equal(typeof mod.readRestartNotice, 'function');
  assert.equal(typeof mod.name, 'string');

  const ctx = {
    logger: () => ({ error() {}, info() {}, warn() {} }),
    webServer: { port: 3080 },
    on: () => () => {},
    effect: () => {},
  };
  const stubService = {
    startProxy: async () => ({}), dispose: async () => {}, status: async () => ({}),
  };
  mod.apply(ctx, {}, {
    service: stubService,
    runUpdate: { currentVersion: () => '1.0.20', loadedVersion: () => '1.0.20', perform: async () => ({ ok: true }) },
    restart: () => ({ helperPid: 1, logOut: '', logErr: '' }),
    restartNotice: async () => null,
  });
  assert.ok(true, 'apply 正常路径不抛错');
});

test('compareVersions：语义化版本比较', async () => {
  const { compareVersions } = await import('../client/api.js');
  assert.ok(compareVersions('1.0.5', '1.0.4') > 0);
  assert.ok(compareVersions('1.0.4', '1.0.5') < 0);
  assert.equal(compareVersions('1.0.4', '1.0.4'), 0);
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0, '两位数字正确比较');
  assert.ok(compareVersions('1.0.4', '1.0.4-rc.1') > 0, '预发布视为更旧');
  assert.ok(compareVersions('1.0.4-rc.1', '1.0.4') < 0, '反过来更旧');
  assert.ok(compareVersions('1.0.4-alpha', '1.0.4-beta') < 0, '预发布后缀按字典序');
  assert.ok(compareVersions('1.0.4-beta.2', '1.0.4-beta.1') > 0, '预发布后缀比较');
  assert.equal(compareVersions('V1.0.4', '1.0.4'), 0, '大写 V 也剥掉');
  assert.ok(compareVersions('1.0.4-rc.10', '1.0.4-rc.9') > 0, '预发布数字段按数值（rc.10 > rc.9）');
  assert.ok(compareVersions('1.0.4-rc.9', '1.0.4-rc.10') < 0, '反过来');
  assert.ok(compareVersions('1.0.4-alpha.1', '1.0.4-alpha.10') < 0, 'alpha.1 < alpha.10（数值比较）');
});

test('killHint：按平台返回停止命令（Windows 无 lsof）', async () => {
  const { killHint } = await import('../lib/web-rpc.js');
  const hint = killHint(3080);
  if (process.platform === 'win32') {
    assert.ok(hint.includes('netstat') && hint.includes('taskkill'), 'Windows 用 netstat/taskkill');
  } else {
    assert.ok(hint.includes('lsof -ti :3080'), 'macOS/Linux 用 lsof');
  }
  assert.ok(!hint.includes('undefined'), '端口正确插入');
});

test('桌面端（desktop=true）：update/restart 关闭，status 带标志，正常功能不受影响', async () => {
  const internals = stubInternals();
  const service = createPocketService({ dshPort: 3080, port: 3081, internals });
  const conn = fakeCtxConnection();
  installPocketRpc({ connection: conn }, {
    service,
    desktop: true,
    runUpdate: { currentVersion: () => '1.4.0', loadedVersion: () => '1.4.0', perform: async () => ({ ok: true }) },
    restart: () => ({ helperPid: 1, logOut: '', logErr: '' }),
    log: { error() {}, warn() {} },
  });
  await service.startProxy();

  const s = await conn.handler(POCKET_ENDPOINTS.status, {});
  assert.equal(s.ok, true);
  assert.equal(s.value.desktop, true, 'status 标记桌面端');

  const u = await conn.handler(POCKET_ENDPOINTS.update, {});
  assert.equal(u.ok, false, '桌面端更新不可用');
  assert.match(u.error.message, /DSH Desktop/, '提示由桌面版管理');

  const r = await conn.handler(POCKET_ENDPOINTS.restart, {});
  assert.equal(r.ok, false, '桌面端重启不可用');
  assert.match(r.error.message, /DSH Desktop/, '提示由桌面版管理');

  await service.dispose();
});

// ---------- WSL 局域网 IP（issue #39） ----------

test('WSL 局域网 IP（issue #39）：parseIpconfig 取物理网卡 IP、排除虚拟网卡；detectWsl 识别环境', async () => {
  const { parseIpconfig, detectWsl } = await import('../lib/service.mjs');

  const zhSample = `\u4ee5\u592a\u7f51\u9002\u914d\u5668 WLAN:
\n\n   连接特定的 DNS 后缀 . . . . . . . :
    本地链接 IPv6 地址. . . . . . . . : fe80::1%12
    IPv4 地址 . . . . . . . . . . . . : 192.168.1.100
    子网掩码  . . . . . . . . . . . . : 255.255.255.0
    默认网关. . . . . . . . . . . . . : 192.168.1.1

\u4ee5\u592a\u7f51\u9002\u914d\u5668 vEthernet (WSL (Hyper-V firewall)):
\n\n   连接特定的 DNS 后缀 . . . . . . . :
    IPv4 地址 . . . . . . . . . . . . : 172.26.96.1
    子网掩码  . . . . . . . . . . . . : 255.255.255.240

\u4ee5\u592a\u7f51\u9002\u914d\u5668 vEthernet (Docker NAT):
\n\n   IPv4 地址 . . . . . . . . . . . . : 10.0.75.1
    子网掩码  . . . . . . . . . . . . : 255.255.255.0
`;
  const zh = parseIpconfig(zhSample);
  assert.deepEqual(zh, ['192.168.1.100'], '中文输出：只取物理网卡 WLAN 的 IP，排除 vEthernet(WSL/Docker)');

  const enSample = `Ethernet adapter Ethernet:
\n\n   Connection-specific DNS Suffix  . :
    Link-local IPv6 Address . . . . . : fe80::2%4
    IPv4 Address. . . . . . . . . . . : 192.168.50.10
    Subnet Mask . . . . . . . . . . . : 255.255.255.0
    Default Gateway . . . . . . . . . : 192.168.50.1

Ethernet adapter vEthernet (WSL):
\n\n   IPv4 Address. . . . . . . . . . . : 172.20.0.1
    Subnet Mask . . . . . . . . . . . : 255.255.255.240
`;
  const en = parseIpconfig(enSample);
  assert.deepEqual(en, ['192.168.50.10'], '英文输出：只取物理网卡 IP');

  const vpnFirst = `Ethernet adapter vEthernet (WSL):
\n\n   IPv4 Address. . . . . . . . . . . : 172.20.0.1

Ethernet adapter Wi-Fi:
\n\n   IPv4 Address. . . . . . . . . . . : 192.168.31.8
`;
  assert.deepEqual(parseIpconfig(vpnFirst), ['192.168.31.8'], '虚拟网卡在前也正确跳过');

  const tailscaleFirst = `Unknown adapter Tailscale:

   IPv4 Address. . . . . . . . . . . : 100.119.24.44

Ethernet adapter WLAN:

   IPv4 Address. . . . . . . . . . . : 10.179.45.172
`;
  assert.deepEqual(parseIpconfig(tailscaleFirst), ['10.179.45.172'], '自动模式仍排除 Tailscale');
  assert.deepEqual(
    parseIpconfig(tailscaleFirst, { includeVpn: true }),
    ['100.119.24.44', '10.179.45.172'],
    '候选模式保留 Tailscale/VPN 地址',
  );

  const prev = process.env.WSL_DISTRO_NAME;
  process.env.WSL_DISTRO_NAME = 'Ubuntu';
  try {
    assert.equal(detectWsl(), true, 'WSL_DISTRO_NAME 存在 → 判定 WSL');
  } finally {
    if (prev === undefined) delete process.env.WSL_DISTRO_NAME;
    else process.env.WSL_DISTRO_NAME = prev;
  }
  assert.equal(detectWsl(), false, '非 WSL 环境返回 false');

  const prevWslEnv = process.env.WSLENV;
  process.env.WSLENV = 'WT_SESSION:WT_PROFILE_ID:';
  try {
    assert.equal(detectWsl(), false, '仅 WSLENV 不判定为 WSL（Windows Terminal 误报）');
  } finally {
    if (prevWslEnv === undefined) delete process.env.WSLENV;
    else process.env.WSLENV = prevWslEnv;
  }
});
