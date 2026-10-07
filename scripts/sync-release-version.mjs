// 发版时同步版本号（semantic-release 本地 prepare 插件）。
//
// 仓库不发 npm（.releaserc.cjs 注释），@semantic-release/npm 已移除，没人再写
// 根 package.json 的版本号；而 mobile 子包又必须声明与根包一致的 version：
// DSH 的 DeepSeek 请求扩展 `dsh_plugin_packages`
//（@deepseek-ai/dsh-plugin-package-inventory-deepseek）要求每个活跃插件包
// manifest 都有非空 name+version，否则每个 deepseek-official 请求在发出前直接
// 报 REQUEST_EXTENSION。这里在发版 prepare 阶段一次性写三处，且保持幂等：
//
//   package.json            根包版本（插件「有更新未重启」提示读它）
//   package-lock.json       锁文件顶层的两个根版本字段（npm lock v3 格式）
//   mobile/package.json     手机端子包版本（与根包一致，避免两处漂移）

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓库根目录（包根）。 */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** 写根 package.json：version 在原位（文件末尾），保持既有键顺序。 */
function updateRootManifest(file, version) {
  const data = readJson(file);
  if (data.version === version) return false;
  data.version = version;
  writeJson(file, data);
  return true;
}

/** 写 npm lock v3：顶层 version 与 packages[""].version 都属于根包。 */
function updateLockfile(file, version) {
  const data = readJson(file);
  const rootPackage = data.packages?.[''];
  if (data.version === version && rootPackage?.version === version) return false;
  data.version = version;
  if (rootPackage !== undefined) rootPackage.version = version;
  writeJson(file, data);
  return true;
}

/** 写 mobile 子包：version 固定插在 name 之后（首次写入也保持这个位置）。 */
function updateMobileManifest(file, version) {
  const data = readJson(file);
  if (data.version === version) return false;
  const ordered = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'version') continue;
    ordered[key] = value;
    if (key === 'name') ordered.version = version;
  }
  if (!('version' in ordered)) ordered.version = version;
  writeJson(file, ordered);
  return true;
}

/**
 * 把发版版本号写入三个 manifest；已一致的文件不重写。
 * @param {string} version 目标版本号（semantic-release 的 nextRelease.version）
 * @param {string} [root] 仓库根目录（测试注入用）
 * @returns {string[]} 实际发生改动的文件（相对根目录）
 */
export function syncReleaseVersion(version, root = packageRoot) {
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error('sync-release-version: version must be a non-empty string');
  }
  const targets = [
    [join(root, 'package.json'), updateRootManifest],
    [join(root, 'package-lock.json'), updateLockfile],
    [join(root, 'mobile', 'package.json'), updateMobileManifest],
  ];
  const changed = [];
  for (const [file, update] of targets) {
    if (!existsSync(file)) continue;
    if (update(file, version)) changed.push(relative(root, file));
  }
  return changed;
}

/**
 * semantic-release prepare 生命周期入口。
 * @param {object} _pluginConfig .releaserc 里的插件配置（本插件无配置）
 * @param {{nextRelease:{version:string},logger:{log:Function}}} context semantic-release 上下文
 */
export async function prepare(_pluginConfig, { nextRelease, logger }) {
  const changed = syncReleaseVersion(nextRelease.version);
  logger.log(changed.length === 0
    ? `sync-release-version: ${nextRelease.version} already in sync`
    : `sync-release-version: ${nextRelease.version} written to ${changed.join(', ')}`);
}
