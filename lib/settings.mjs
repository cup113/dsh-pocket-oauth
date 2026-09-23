// dsh-pocket 设置持久化（$DSH_HOME/dsh-pocket/settings.json）
//
// 当前项：
//   - mobileRightbarEnabled 手机端右边栏入口（默认开启）
//   - proxyPort             代理监听端口（默认 3081）
// OAuth 凭据/绑定/回调白名单存在同目录 oauth.json（lib/oauth.mjs 管理）。
// 默认**开启**（安全优先）。

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const settingsRel = join('dsh-pocket', 'settings.json');
export function settingsPath() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), settingsRel);
}

function readSettings() {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch { /* 无文件/损坏 → 默认 */ }
  return {};
}

function writeSettings(s) {
  try {
    mkdirSync(dirname(settingsPath()), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(s, null, 2), { mode: 0o600 });
  } catch { /* 忽略 */ }
  return s;
}

/** 手机端右边栏入口：默认开启，可按需关闭以保持更紧凑的标题栏。 */
export function mobileRightbarEnabled() {
  return readSettings().mobileRightbarEnabled !== false;
}

/** 设置手机端右边栏入口，返回新状态（持久化）。 */
export function setMobileRightbarEnabled(on) {
  const s = readSettings();
  s.mobileRightbarEnabled = !!on;
  writeSettings(s);
  return s.mobileRightbarEnabled;
}

// ---------- 恢复出厂设置 ----------
// 设置出问题时的临时兜底：删掉 settings.json 即回到出厂默认。
// DSH 自身的会话、模型、插件配置都在 $DSH_HOME 的其他目录，不受影响。

/** 删除本机设置文件（不存在也算成功）；返回 true 表示已清空。 */
export function resetSettings() {
  try {
    rmSync(settingsPath(), { force: true });
    return true;
  } catch {
    return false;
  }
}

// ---------- 代理端口（issue #70） ----------
// 局域网代理的监听端口（默认 3081）。插件模式下唯一改法就是写 settings.json 的
// proxyPort 字段（CLI 模式可用 dsh-pocket --port）。允许范围 1-65535；
// 端口已被占用时 dsh web 启动会直接抛 EADDRINUSE（保持原行为），不必在 setter 校验。
/** 当前代理端口（0 = 用默认 3081）。 */
export function proxyPort() {
  const v = Number(readSettings().proxyPort);
  return Number.isInteger(v) && v >= 1 && v <= 65535 ? v : 0;
}

/** 设置代理端口（持久化）。空/0/非法值清除，回退默认 3081。 */
export function setProxyPort(value) {
  const n = Number(value);
  const s = readSettings();
  if (Number.isInteger(n) && n >= 1 && n <= 65535) s.proxyPort = n;
  else delete s.proxyPort;
  writeSettings(s);
  return proxyPort();
}
