// 打包结构测试：一个插件包（远程操控）+ 一个子包（手机端 WebUI）。
//
// 手机端 WebUI 由子包 mobile/（dsh-pocket-mobile）交付：宿主半边是空壳，全部界面能力在
// 客户端半边（mobile/client/** → mobile/client/client.js，由 client/build.mjs 打包）。
// 这里固化的是「交付形态与可解析性」的那部分不变量：
//
//   - cordis.patch.yml 两条 row：两个**裸包名**、id 稳定（面板开关写的就是这两个 id）；
//   - 根 manifest：dependencies(file:./mobile) + bundledDependencies + exports["./lib/*"]；
//   - 仓库里两条软链（bundled 子包 + 开发态自引用）存在且指向正确；
//   - 子包 manifest：声明 dsh.client 与 ./client 产物入口、locale 元数据与版本号；
//   - 移动端实现（mobile/client/**）源码与产物齐全；
//   - 远程操控产物里不含任何移动端标记。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS } from '../client/api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
const mobileManifest = JSON.parse(readFileSync(join(root, 'mobile', 'package.json'), 'utf8'));

// ── bundle patch：两条 row ───────────────────────────────────────────────────

test('cordis.patch.yml：一个 bundle、两条 row，都是裸包名', () => {
  const rows = [...patch.matchAll(/-\s*id:\s*([^\s#]+)\s*\n\s*name:\s*([^\s#]+)/g)]
    .map(([, id, name]) => ({ id, name }));
  assert.deepEqual(rows, [
    { id: 'dsh-pocket', name: 'dsh-pocket' },
    { id: 'dsh-pocket-mobile', name: 'dsh-pocket-mobile' },
  ], '两条 row：远程操控 + 手机端 WebUI（独立客户端包；id/name 稳定 → 面板开关覆盖在升级后依然生效）');
  // 行 id 是面板开关写 disabled 覆盖的键：必须唯一
  assert.equal(new Set(rows.map((r) => r.id)).size, 2);
  for (const row of rows) {
    assert.ok(!row.name.includes('/'), `${row.name} 必须是裸包名：带 "/" 的行名解析不到包`);
  }
});

// ── 根 manifest：子包随包安装 ────────────────────────────────────────────────

test('根 manifest：子包声明为 file: 依赖 + bundledDependencies（git 安装一并落地）', () => {
  assert.equal(pkg.dependencies['dsh-pocket-mobile'], 'file:./mobile');
  assert.ok(Array.isArray(pkg.bundledDependencies), 'bundledDependencies 必须存在，否则 pnpm 打包时会丢掉子包');
  assert.ok(pkg.bundledDependencies.includes('dsh-pocket-mobile'));
  assert.equal(pkg.exports['./client'], './client/client.js', '根包客户端产物 = 远程操控');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(typeof pkg.exports['./lib/*'], 'string', 'exports["./lib/*"]：将来移动端子包复用共享层（传输层 / 剪贴板）');
  assert.equal(pkg.exports['./mobile'], undefined, '不再有 ./mobile 子路径行名（子路径不贡献客户端模块）');
  assert.ok(!pkg.files.includes('mobile'), 'files 不带 mobile 源码：子包内容按 bundledDependencies 随包走');
});

test('仓库软链：bundled 子包 + 开发态自引用（scripts/link-mobile-package.mjs 维护）', () => {
  const bund = join(root, 'node_modules', 'dsh-pocket-mobile');
  assert.ok(lstatSync(bund).isSymbolicLink(), 'node_modules/dsh-pocket-mobile 必须是软链（打包时被解引用进安装物）');
  assert.equal(readlinkSync(bund), '../mobile');
  const self = join(root, 'node_modules', 'dsh-pocket');
  assert.ok(lstatSync(self).isSymbolicLink(), 'node_modules/dsh-pocket 自引用软链：给将来移动端宿主半边 import "dsh-pocket/lib/*" 预留');
  assert.equal(readlinkSync(self), '..');
});

test('行名解析：dsh-pocket-mobile 必须能从根包目录解析到子包（DSH 的 profile scope 映射同理）', () => {
  const entry = require.resolve('dsh-pocket-mobile');
  assert.ok(entry.endsWith(join('mobile', 'index.js')), `dsh-pocket-mobile 应解析到 mobile/index.js，实际 ${entry}`);
  // DSH 的 createRuntimeResolution() 用 packageDirFromAnchor(包manifest, 依赖名) 找子包目录：
  // 第一条搜索路径就是本包的 node_modules，这正是子包能被映射的原因。
  const searchPaths = createRequire(join(root, 'package.json')).resolve.paths('dsh-pocket-mobile');
  assert.equal(searchPaths[0], join(root, 'node_modules'));
  assert.ok(existsSync(join(searchPaths[0], 'dsh-pocket-mobile', 'package.json')));
  // 自引用软链的用途：将来移动端宿主半边在子包里 import 'dsh-pocket/lib/*'（开发态解析）
  const fromSubpackage = createRequire(join(root, 'mobile', 'index.js')).resolve('dsh-pocket/lib/rpc-route.js');
  assert.ok(fromSubpackage.endsWith(join('lib', 'rpc-route.js')), `子包应能解析到共享层，实际 ${fromSubpackage}`);
});

// ── 子包 manifest：移动端 WebUI 客户端组件 ──────────────────────────────

test('mobile/package.json：声明 dsh.client 与 ./client 客户端产物入口', () => {
  assert.equal(mobileManifest.name, 'dsh-pocket-mobile');
  assert.ok(mobileManifest.description && mobileManifest.description.length > 0, '面板组件行需要描述');
  assert.deepEqual(mobileManifest.dsh, {
    client: {
      platform: 'web',
      inject: ['slots', 'layout'],
    },
  }, '声明 dsh.client：DSH 判定它是客户端包（只依赖真正用到的 slots / layout）');
  assert.equal(mobileManifest.exports['.'], './index.js');
  assert.equal(mobileManifest.exports['./client'], './client/client.js', '客户端产物入口');
  assert.equal(mobileManifest.exports['./package.json'], './package.json');
  assert.equal(mobileManifest.exports['./locale/*'], './locale/*', '面板行的标题/描述靠它解析');
  assert.ok(existsSync(join(root, 'mobile', 'client', 'client.js')), 'mobile/client/client.js 产物必须存在');
  assert.equal(mobileManifest.version, pkg.version, 'mobile 子包版本必须与根包一致（同步由发版插件负责）');
});

test('子包 locale 元数据：面板标题/描述（zh/en 通过包名解析）', () => {
  for (const lang of ['zh', 'en']) {
    const file = require.resolve(`dsh-pocket-mobile/locale/${lang}.json`);
    assert.ok(existsSync(file), `${lang}.json 必须存在`);
    const meta = JSON.parse(readFileSync(file, 'utf8')).meta;
    assert.ok(meta.title && meta.description, `${lang}.json 需要 meta.title 与 meta.description`);
  }
});

// ── 移动端实现完整性 ─────────────────────────────────────────────────────────

test('移动端实现：源码与客户端产物结构完整', () => {
  assert.ok(existsSync(join(root, 'mobile', 'client', 'index.jsx')), 'mobile/client/index.jsx 存在');
  assert.ok(existsSync(join(root, 'mobile', 'client', 'client.js')), 'mobile/client/client.js 存在');
  assert.ok(existsSync(join(root, 'mobile', 'client', 'responsive-shell.js')), 'responsive-shell.js 存在');
  assert.ok(existsSync(join(root, 'mobile', 'client', 'settings-adapter.js')), 'settings-adapter.js 存在');
  assert.ok(existsSync(join(root, 'mobile', 'client', 'styles.js')), 'styles.js 存在（移动端样式的唯一来源）');
  const bundle = readFileSync(join(root, 'mobile', 'client', 'client.js'), 'utf8');
  assert.ok(bundle.includes('id: "dsh-pocket-mobile"'), 'mobile bundle loader id 正确');
  assert.ok(bundle.includes('var React = require("react")'), 'mobile bundle 注入 React');
  assert.ok(bundle.includes('dsh-mobile-sidebar-backdrop'), 'mobile bundle 包含抽屉遮罩');
  assert.ok(bundle.includes('data-mobile-settings-view'), 'mobile bundle 包含两级设置导航');
});

test('子包宿主：插件形状完整（name / inject / apply 空实现）', async () => {
  const mod = await import('../mobile/index.js');
  assert.equal(mod.name, 'dsh-pocket-mobile');
  assert.deepEqual(mod.inject, [], '宿主半边不依赖任何服务');
  assert.equal(typeof mod.apply, 'function');
  assert.equal(mod.apply({}, {}, {}), undefined, 'apply 是空实现（全部界面能力由客户端半边提供）');
  const rootMod = await import('../lib/index.js');
  assert.equal(typeof rootMod.apply, 'function');
  assert.equal(rootMod.name, 'dsh-pocket');
});

// ── 远程操控产物不含移动端专有标记 ───────────────────────────────────────────

test('客户端产物：远程操控产物不含移动端专有标记', () => {
  const remote = readFileSync(join(root, 'client', 'client.js'), 'utf8');
  assert.ok(remote.includes('id: "dsh-pocket"'), '根产物 loader id = 包名 dsh-pocket');
  assert.ok(remote.includes('PocketSettingsTab'), '根产物含「手机访问」设置页');
  for (const marker of [
    '/dsh-pocket-mobile',
    'pocketMobile',
    'data-dsh-pocket-layout',
    'dsh-mobile-nav',
    'dsh_pocket_mobile_prefs',
    'dsh-mobile-sidebar-backdrop',
    'data-mobile-settings-view',
    'data-dsh-pocket-mobile-rightbar',
    'mobile.rightbar.setEnabled',
    'mobile.fileRead',
  ]) {
    assert.ok(!remote.includes(marker), `根产物不应包含移动端标记 ${marker}`);
  }
  assert.ok(!remote.includes('__DSH_POCKET_COMPONENTS__'), '旧的页面开关协议应当已删除');
  // 客户端 inject：这份产物仍然声明自己需要的 cordis 服务
  assert.ok(
    remote.includes('inject = ["slots", "connection", "layout", "locale", "sessionLogDownload"]'),
    '根产物缺少客户端 inject 声明',
  );
});

test('远程操控通道：端点集合里没有移动端端点（它们已随组件删除）', () => {
  assert.equal(POCKET_RPC_CHANNEL, '/dsh-pocket');
  const endpoints = Object.values(POCKET_ENDPOINTS);
  for (const gone of ['mobile.status', 'mobile.rightbar.setEnabled', 'mobile.fileRead']) {
    assert.ok(!endpoints.includes(gone), `${gone} 不应再出现在任何契约里`);
  }
});
