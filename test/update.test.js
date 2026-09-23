// 更新机制（GitHub 化）：安装类型探测与按类型分发更新。
//
// 背景：npm 上的 `dsh-pocket` 包名属于**原版**（PIN 模型，不是本仓库），
// `dsh plugin update dsh-pocket --latest` 会把本插件整体换成那个应用。所以必须先
// 探测安装类型再决定动作：
//   - source：.git 存在（link: 软链到本地 clone）→ `git pull --ff-only`；
//   - git：profile 依赖规格是 github:/git+ → 重跑 add 重新 pin 最新 main 提交；
//   - unknown：拒绝自动更新 + 给重装指引（绝不回落到 npm 那条通路）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectInstallKind, performManagedUpdate } from '../lib/index.js';

test('detectInstallKind：.git 存在 → source（link: 软链到本地 clone）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dshp-kind-src-'));
  try {
    await mkdir(join(dir, '.git'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-pocket', version: '1.0.0' }));
    assert.equal(detectInstallKind(dir), 'source');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectInstallKind：profile 依赖规格为 github:/git+ → git（pnpm 把插件物化在 profile 内）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dshp-kind-git-'));
  const pluginDir = join(root, 'profiles', 'web', 'node_modules', 'dsh-pocket');
  try {
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'package.json'), JSON.stringify({ name: 'dsh-pocket', dependencies: { qrcode: '^1.5.4' } }));
    await writeFile(
      join(root, 'profiles', 'web', 'package.json'),
      JSON.stringify({ dependencies: { 'dsh-pocket': 'github:cup113/dsh-pocket-oauth' } }),
    );
    assert.equal(detectInstallKind(pluginDir), 'git', '向上找到 profile 的 github: 规格');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('detectInstallKind：识别不出 → unknown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dshp-kind-unknown-'));
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-pocket' }));
    assert.equal(detectInstallKind(dir), 'unknown');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('performManagedUpdate：unknown 安装类型 fail-fast（不执行任何命令，给重装指引）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dshp-update-unknown-'));
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-pocket' }));
    const r = await performManagedUpdate('web', {}, dir);
    assert.equal(r.ok, false, '拒绝自动更新（而不是落到 npm 原版那条路）');
    assert.match(r.error, /无法识别安装方式|unrecognized install kind/);
    assert.match(r.output, /github:cup113\/dsh-pocket-oauth/, '给出 GitHub 重装命令');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
