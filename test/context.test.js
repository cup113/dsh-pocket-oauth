// 设置页「复制排障上下文」与二维码分组的纯函数（无 DOM 依赖，可直接单测）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildTroubleshootingContext, fallbackKind, redactStatus } from '../client/api.js';

test('fallbackKind：按 host 推断分组（与服务端 classifyHost 同一套网段）', () => {
  assert.equal(fallbackKind('http://127.0.0.1:3081'), 'local');
  assert.equal(fallbackKind('http://localhost:3081'), 'local');
  assert.equal(fallbackKind('http://192.168.1.5:3081'), 'lan');
  assert.equal(fallbackKind('http://10.0.0.7:3081'), 'lan');
  assert.equal(fallbackKind('http://100.119.24.44:3081'), 'lan', 'Tailscale CGNAT 属局域网');
  assert.equal(fallbackKind('http://mydesktop.local:3081'), 'lan');
  assert.equal(fallbackKind('https://pocket.example.com'), 'public');
  assert.equal(fallbackKind('garbage'), 'public', '无法解析 → 公网兜底（宁可要求认证）');
});

test('redactStatus：originQrs 放行 kind；旧服务端缺 kind 时按 host 兜底', () => {
  const s = redactStatus({
    originQrs: [
      { origin: 'https://pocket.example.com', kind: 'public', qr: 'data:qr' },
      { origin: 'http://192.168.1.5:3081', qr: 'data:qr2' },
    ],
  });
  assert.deepEqual(s.originQrs.map((o) => o.kind), ['public', 'lan']);
  assert.equal(s.originQrs[0].qr, 'data:qr', '二维码 data URL 原样保留');
});

test('buildTroubleshootingContext：含目标/架构/状态/常见坑，供外部 AI 接管', () => {
  const md = buildTroubleshootingContext({
    proxyRunning: true,
    proxyPort: 3081,
    dshPort: 3080,
    lanCandidates: ['192.168.1.5'],
    oauth: {
      configured: true,
      bound: true,
      boundLogin: 'alice',
      callbackOrigins: ['http://127.0.0.1:3081', 'https://pocket.example.com'],
    },
    originQrs: [
      { origin: 'http://127.0.0.1:3081', kind: 'local', qr: 'data:qr' },
      { origin: 'https://pocket.example.com', kind: 'public', qr: 'data:qr2' },
    ],
  }, { version: { current: '2.10.6', loaded: '2.10.6', installKind: 'source' }, ua: 'TestUA/1.0' });

  assert.match(md, /排障上下文/, '标题');
  assert.match(md, /我要实现什么/, '用户目标段');
  assert.match(md, /http:\/\/127\.0\.0\.1:3081/, '列出本机地址');
  assert.match(md, /https:\/\/pocket\.example\.com/, '列出公网地址');
  assert.match(md, /Gitee OAuth/, '说明认证模型');
  assert.match(md, /Host/, '说明隧道 Host 不得改写');
  assert.match(md, /git pull/, 'installKind=source 给出对应更新方式');
  assert.match(md, /已绑定账号 alice/, '状态快照含绑定账号');
  assert.match(md, /常见坑/, '常见坑清单');
  assert.match(md, /TestUA\/1\.0/, '带 UA 便于定位浏览器差异');
  assert.ok(!/Client Secret:\s*\S/.test(md), '上下文不含任何 secret 值');
});

test('buildTroubleshootingContext：未初始化（status=null）也不抛错', () => {
  const md = buildTroubleshootingContext(null);
  assert.match(md, /排障上下文/);
  assert.match(md, /-（无）/, '无白名单时给占位而非崩溃');
});
