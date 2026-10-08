// 发版版本同步插件（scripts/sync-release-version.mjs）回归测试。
//
// 背景：DSH 的 DeepSeek 请求扩展 `dsh_plugin_packages` 要求每个活跃插件包
// manifest 都有非空 name+version，mobile 子包漏 version 会让每个
// deepseek-official 请求在发出前直接报 REQUEST_EXTENSION。仓库不发 npm 后
// 版本号只能由本地 prepare 插件写，且必须幂等、三处同步。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncReleaseVersion } from '../scripts/sync-release-version.mjs';

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pocket-release-'));
  writeJson(join(root, 'package.json'), { name: 'dsh-pocket', version: '1.0.0' });
  writeJson(join(root, 'package-lock.json'), {
    name: 'dsh-pocket',
    version: '1.0.0',
    lockfileVersion: 3,
    packages: { '': { name: 'dsh-pocket', version: '1.0.0' } },
  });
  mkdirSync(join(root, 'mobile'));
  writeJson(join(root, 'mobile', 'package.json'), { name: 'dsh-pocket-mobile', private: true });
  return root;
}

test('syncReleaseVersion：一次写根包 / 锁文件 / mobile 子包，且幂等', () => {
  const root = fixture();
  try {
    assert.deepEqual(
      // 返回的是平台路径：Windows 上是 `mobile\package.json`，这里统一成 POSIX 再比较
      syncReleaseVersion('1.2.3', root).map((file) => file.split('\\').join('/')).sort(),
      ['mobile/package.json', 'package-lock.json', 'package.json'],
      '三个 manifest 都要写',
    );
    assert.equal(readJson(join(root, 'package.json')).version, '1.2.3');
    const lock = readJson(join(root, 'package-lock.json'));
    assert.equal(lock.version, '1.2.3');
    assert.equal(lock.packages[''].version, '1.2.3', 'npm lock v3 的根版本字段有两个');
    const mobile = readJson(join(root, 'mobile', 'package.json'));
    assert.equal(mobile.version, '1.2.3', 'mobile 子包必须声明 version');
    assert.deepEqual(Object.keys(mobile), ['name', 'version', 'private'], 'version 固定插在 name 之后');
    assert.deepEqual(syncReleaseVersion('1.2.3', root), [], '版本已一致时不应重写文件');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('syncReleaseVersion：拒绝空版本号', () => {
  assert.throws(() => syncReleaseVersion('  ', '/does/not/matter'), /non-empty string/);
});
