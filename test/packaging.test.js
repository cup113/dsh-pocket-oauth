// 打包结构测试：一个插件包（远程操控）+ 一个子包（手机端 WebUI）。
//
// 手机端 WebUI 由子包 mobile/（dsh-pocket-mobile）交付：宿主半边是空壳，全部界面能力在
// 客户端半边（mobile/client/** → mobile/client/client.js，由 client/build.mjs 打包）。
// 这里固化的是「交付形态与可解析性」的那部分不变量：
//
//   - cordis.patch.yml 两条 row：两个**裸包名**、id 稳定（面板开关写的就是这两个 id）；
//   - 根 manifest：files 带上 mobile/、postinstall 建链、不再有 file:/bundled 依赖；
//   - 子包 manifest：声明 dsh.client 与 ./client 产物入口、locale 元数据与版本号；
//   - 移动端实现（mobile/client/**）源码与产物齐全；
//   - **打包不变量**：真实 `npm pack` 产物里带着 mobile/，且那条 row 的裸包名能从
//     解包后的包锚点解析到（DSH 的 packageDirFromAnchor 用的就是这个 Node 原语）；
//   - 远程操控产物里不含任何移动端标记。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS } from '../client/api.js';
import { ensureMobileLink, packageRoot as scriptPackageRoot } from '../scripts/link-mobile-package.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
const mobileManifest = JSON.parse(readFileSync(join(root, 'mobile', 'package.json'), 'utf8'));

/** cordis.patch.yml 里插入的 row（id + name），按出现顺序。 */
function patchRows() {
  return [...patch.matchAll(/-\s*id:\s*([^\s#]+)\s*\n\s*name:\s*([^\s#]+)/g)].map(([, id, name]) => ({ id, name }));
}

// ── bundle patch：两条 row ───────────────────────────────────────────────────

test('cordis.patch.yml：一个 bundle、两条 row，都是裸包名', () => {
  const rows = patchRows();
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

// ── 根 manifest：子包随包发布 + postinstall 建链 ─────────────────────────────

test('根 manifest：files 带 mobile/、postinstall 建链，且没有 file:/bundled 依赖', () => {
  assert.ok(pkg.files.includes('mobile'), 'files 必须带上 mobile：子包靠它进安装物');
  assert.equal(pkg.scripts.postinstall, 'node scripts/link-mobile-package.mjs', 'postinstall 是子包的交付机制');
  // 这三种写法都被证明到不了安装态，回潮即回归：
  assert.equal(pkg.dependencies['dsh-pocket-mobile'], undefined,
    'file:./mobile 会被 pnpm 相对 profile 目录解析并让整个安装失败（ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND）');
  assert.equal(pkg.bundledDependencies, undefined,
    'bundledDependencies 只被 pnpm 记成元数据，子包不进依赖图（也就没人装它）');
  assert.equal(pkg.optionalDependencies, undefined, 'optionalDependencies 的 file: 会被 pnpm 静默丢弃');
  assert.equal(pkg.exports['./client'], './client/client.js', '根包客户端产物 = 远程操控');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(typeof pkg.exports['./lib/*'], 'string', 'exports["./lib/*"]：将来移动端子包复用共享层（传输层 / 剪贴板）');
  assert.equal(pkg.exports['./mobile'], undefined, '不再有 ./mobile 子路径行名（子路径不贡献客户端模块）');
});

test('postinstall 脚本：链接指向包内 mobile/，且解析出的包根与 manifest 一致', () => {
  assert.equal(resolve(scriptPackageRoot), resolve(root), 'packageRoot 必须解析到包根（postinstall 的 cwd 未必可靠）');
  assert.ok(existsSync(join(root, 'scripts', 'link-mobile-package.mjs')), 'postinstall 脚本必须随包发布');
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
    const file = join(root, 'mobile', 'locale', `${lang}.json`);
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

// ── 打包不变量（缺陷就长在这一层） ───────────────────────────────────────────
//
// 只测工作区会漏掉真正的缺陷：上面的软链恰好让工作区解析得到，而安装物里什么都没有。
// 所以这里走一次**真实的 npm pack**，在解包目录上断言，并用 DSH 的同一个原语
// （createRequire(anchor).resolve.paths → 找 <searchPath>/<name>/package.json）验证解析。

/** 工作区内的临时目录：测试期间由本进程持有，结束后删除。 */
function tempDir(prefix) {
  const base = join(root, '.test-tmp');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

/**
 * `npm pack` 出 tarball 并解包到 dest。
 *
 * 有意**不捕获**子进程输出（`stdio: 'ignore'`）：受限环境会拒绝带管道的子进程
 * （spawn EPERM）。`--pack-destination` 已经指定了落盘目录，产物名由清点该目录得到。
 * @returns {{extract: string, entries: {name: string, rel: string, type: string, size: number}[]}}
 */
function packAndExtract(dest) {
  const cache = join(dest, '..', `${basename(dest)}-cache`);
  execFileSync('npm', ['pack', '--pack-destination', dest, '--cache', cache], {
    cwd: root, shell: true, stdio: 'ignore',
  });
  const tarball = readdirSync(dest).filter((name) => name.endsWith('.tgz'));
  assert.equal(tarball.length, 1, `npm pack 应产出唯一 tarball，实际 ${tarball.join(', ') || '(无)'}`);
  const tgz = readFileSync(join(dest, tarball[0]));
  // npm pack 出的 tar 对每个文件各有一段 gzip member；一次性解压整条流即可。
  const tar = gunzipSync(tgz);
  const extract = join(dest, 'unpacked');
  mkdirSync(extract, { recursive: true });
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (name === '') break;
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8);
    const type = String.fromCharCode(header[156]);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    const rel = name.replace(/^package\//, '');
    entries.push({ name, rel, type, size });
    if (type === '0' || type === '\0' || type === '') {
      const file = join(extract, rel);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, body);
    } else if (type === '5') {
      mkdirSync(join(extract, rel), { recursive: true });
    } else if (type === '2') {
      const link = body.toString('utf8');
      mkdirSync(join(extract, rel, '..'), { recursive: true });
      writeFileSync(join(extract, rel), link); // 解包器把软链落成普通文件，仅用于「是否悬空」判定
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return { extract, entries };
}

test('打包：mobile/ 在 tarball 里，且 dsh-pocket-mobile 能从解包后的包锚点解析到', async () => {
  const dir = tempDir('pack-');
  try {
    const { extract, entries } = packAndExtract(dir);
    const rels = entries.map((entry) => entry.rel);

    // 1) 子包必须真的在产物里（放在 node_modules/ 下没用：pnpm/npm 会丢掉它）
    assert.ok(rels.includes('mobile/package.json'), `tarball 缺少 mobile/package.json；实际顶层：${[...new Set(rels.map((r) => r.split('/')[0]))].join(', ')}`);
    assert.ok(rels.includes('mobile/client/client.js'), 'tarball 缺少 mobile/client/client.js（手机端产物）');
    assert.ok(rels.includes('mobile/index.js'), 'tarball 缺少 mobile/index.js（子包宿主入口）');
    assert.ok(rels.includes('scripts/link-mobile-package.mjs'), 'tarball 缺少 postinstall 脚本');
    assert.ok(!rels.some((rel) => rel.startsWith('node_modules/')),
      '安装物里不得再带仓库内的 node_modules 内容（pnpm 解包时会丢，且会掩盖真实解析）');

    // 2) postinstall 在解包目录上跑一次，复现安装态
    const extractedRoot = join(extract);
    const result = await ensureMobileLink(extractedRoot);
    assert.notEqual(result, 'skipped', 'postinstall 必须能把子包接进解包目录');
    assert.ok(existsSync(join(extractedRoot, 'node_modules', 'dsh-pocket-mobile', 'package.json')),
      'postinstall 之后 node_modules/dsh-pocket-mobile/package.json 必须存在');

    // 3) 每条非根包的裸包名，都要能从包锚点解析到——用 DSH packageDirFromAnchor 的同一个原语
    const anchor = join(extractedRoot, 'package.json');
    for (const row of patchRows()) {
      if (row.name === pkg.name) continue;
      const searchPaths = createRequire(anchor).resolve.paths(row.name) ?? [];
      const resolved = searchPaths.map((p) => join(p, row.name)).find((c) => existsSync(join(c, 'package.json')));
      assert.ok(resolved !== undefined,
        `row ${row.id}（${row.name}）必须能从包锚点解析到；搜索路径：\n  ${searchPaths.join('\n  ')}`);
      // 解析到的必须是**本包内**的子包，而不是恰好存在的别处副本
      assert.equal(resolved, join(extractedRoot, 'node_modules', row.name), `row ${row.id} 应解析到包内子包`);
    }
    // 4) 子包 manifest 与 locale 也要跟着解析得到（面板元数据靠它）
    for (const name of ['dsh-pocket-mobile', 'dsh-pocket-mobile/package.json']) {
      assert.ok(createRequire(anchor).resolve(name).startsWith(extractedRoot), `${name} 应能从包锚点解析`);
    }

    // 5) 解包产物里不得有悬空链接（软链在 tar 里是常规条目，解包后按链接落盘）
    for (const entry of entries) {
      const file = join(extract, entry.rel);
      const stat = lstatSync(file, { throwIfNoEntry: false });
      if (stat?.isSymbolicLink() !== true) continue;
      const target = readFileSync(file, 'utf8');
      assert.ok(existsSync(join(file, '..', target)), `解包产物里的软链 ${entry.rel} -> ${target} 悬空`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
