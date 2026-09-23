// dsh-pocket 插件入口（单包单插件：Gitee OAuth 远程访问电脑上的 DSH）
//
// 模型（v3 重构）：
//   - 插件只暴露一个代理端口（默认 3081，监听 0.0.0.0 供隧道回连）；
//   - 公网入口由用户自建隧道（固定域名）指向该端口，插件不管理任何隧道；
//   - 访问控制 = Gitee OAuth（代替旧 PIN）：本机一次初始化绑定 Gitee 账号，
//     此后任意设备经白名单地址用同一账号登录即获得会话。
//
// 设置一级入口「手机访问」：
//   - 代理状态与端口、OAuth 绑定状态、各白名单地址二维码
//   - 更新提示：有新版本时显示一键更新按钮（dsh plugin update --latest）
// 手机看到的界面 = 电脑上的 dsh web，实时同步（WebSocket 透传）。

import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

import { createPocketService } from './service.mjs';
import { installPocketRpc } from './web-rpc.js';
import { restartHost } from './restart.js';
import { advancedNoticeScript, DEFAULT_INJECT } from './proxy.mjs';
import { readOAuthConfig, writeOAuthConfig, clearOAuthConfig, oauthView } from './oauth.mjs';
import { mobileRightbarEnabled, setMobileRightbarEnabled, resetSettings, proxyPort } from './settings.mjs';

const name = 'dsh-pocket';
const inject = ['connection', 'webServer'];

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkgDir = dirname(pkgPath);

/**
 * 本插件磁盘上的已安装版本。注意：**不能用 require 缓存**（进程内永远不变），
 * 必须实时读文件——一键更新会改写 package.json，「已更新未重启」靠它识别。
 */
function currentVersion() {
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

/** 进程启动时加载的版本（模块加载瞬间固化；用于识别「磁盘已更新但进程还是旧代码」）。 */
const loadedVersion = currentVersion();

// ---------- Gitee OAuth 会话密钥 ----------
// 进程级随机密钥：会话 cookie 绑定它（dsh web 重启/更新后 sessionKey 变化 →
// 所有设备需重新登录）。「登出所有设备」= 轮换它。
const session = { key: randomBytes(16).toString('hex') };

/**
 * 把回调取回的 gitee 用户绑定到本机（setup 流程，仅 loopback 发起）。
 * 保留已保存的凭据与白名单，只落 boundUid / boundLogin。
 */
export function bindGiteeUser(user) {
  const cfg = readOAuthConfig() ?? { clientId: '', clientSecret: '', callbackOrigins: [] };
  return writeOAuthConfig({
    ...cfg,
    boundUid: String(user.id),
    boundLogin: typeof user.login === 'string' ? user.login : String(user.id),
  });
}

/** 解除绑定（保留凭据与白名单；重新绑定走本机 /pocket-setup）。 */
export function unbindGiteeUser() {
  const cfg = readOAuthConfig();
  if (!cfg) return oauthView(null);
  return oauthView(writeOAuthConfig({ ...cfg, boundUid: null, boundLogin: null }));
}

/** 轮换进程级会话密钥：所有已登录设备的 cookie 立即失效。 */
export function rotateSessionKey() {
  session.key = randomBytes(16).toString('hex');
  return true;
}

/**
 * 恢复出厂设置（设置页底部按钮）：清空本机设置 + 清除 OAuth 配置（凭据与绑定）。
 * 只动 $DSH_HOME/dsh-pocket/ 下的文件，DSH 自身的会话、模型、插件配置不受影响。
 * @returns {object} 清除后的 OAuth 安全面视图
 */
export function resetPocketState() {
  resetSettings();
  clearOAuthConfig();
  rotateSessionKey();
  return oauthView(null);
}

const restartNoticeRel = join('dsh-pocket', 'restarted.json');
function restartNoticePath() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), restartNoticeRel);
}
async function readRestartNotice() {
  try {
    const raw = JSON.parse(await readFile(restartNoticePath(), 'utf8'));
    if (!raw?.at) return null;
    if (Date.now() - raw.at > 30 * 60 * 1000) return null; // 30 分钟后过期
    return raw;
  } catch { return null; }
}
function writeRestartNotice() {
  return mkdir(dirname(restartNoticePath()), { recursive: true })
    .then(() => writeFile(restartNoticePath(), JSON.stringify({ at: Date.now(), pid: process.pid }), 'utf8'));
}
/**
 * 读重启标记并**删除**（一次性消费）：重启后首次打开设置页显示一次「已重启」横幅，
 * 之后不再出现——否则残留文件会让「已重启」一直显示（用户没点重启也误报）。
 */
async function consumeRestartNotice() {
  const notice = await readRestartNotice();
  if (notice) {
    await rm(restartNoticePath(), { force: true }).catch(() => {});
  }
  return notice;
}
/**
 * 自重启：先拉起 helper（失败就如实返回，不写标记），成功后写重启标记
 * （新进程据此显示一次「已重启」横幅）。
 */
function pocketRestart() {
  const result = restartHost();
  if (!result || result.helperPid == null) return result; // helper 都没 spawn 出来 → 失败
  writeRestartNotice().catch(() => {});
  return result;
}

/**
 * 安装类型探测（每次实时探测，供更新分支与设置页提示使用）：
 *   - 'source'：插件真实目录里有 .git —— link: 软链到本地 clone（ESM 的
 *     import.meta.url 已解析到真实路径）。更新走 `git pull`。
 *   - 'git'：向上（≤6 级）找到 profile 的 package.json 且 dsh-pocket 依赖规格
 *     为 github:/git+（pnpm 会把 github: 安装物化在 profile 内部，走得上去）。
 *     更新走重跑 `dsh plugin add github:…` 重新 pin 最新 main 提交。
 *   - 'unknown'：识别不出（file: 拷贝等）。更新按钮 fail-fast——绝不回落到
 *     `dsh plugin update`：npm 的 dsh-pocket 是原版（PIN 模型），那条路会把
 *     本插件整体换成另一个应用（README 曾专门警告「别点」）。
 */
export function detectInstallKind(root = pkgDir) {
  try {
    if (existsSync(join(root, '.git'))) return 'source';
  } catch { /* 忽略探测失败 */ }
  let dir = root;
  for (let i = 0; i < 6; i++) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const spec = raw?.dependencies?.[name];
      if (typeof spec === 'string') return /^github:|^git\+/.test(spec) ? 'git' : 'unknown';
    } catch { /* 无文件/损坏 → 继续向上找 */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return 'unknown';
}

/** 受管子进程：收集输出（截断防膨胀）、超时杀掉；resolve 统一 { ok, code, output }。 */
function spawnManaged(command, args, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Windows 上裸 spawn('dsh') 解析到无扩展名 POSIX shim → ENOENT；
      // Node 22+ 直接 spawn .cmd 会 EINVAL（CVE-2024-27980），必须走 shell（PR #54）
      shell: process.platform === 'win32',
    });
    let out = '';
    const onData = (c) => { out += String(c); if (out.length > 4000) out = out.slice(-4000); };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, output: out.slice(-800) });
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}

/** 源码安装（link: → git clone）更新：在插件目录 git pull --ff-only。 */
function performSourceUpdate(opts = {}, root = pkgDir) {
  return spawnManaged('git', ['-C', root, 'pull', '--ff-only'], opts);
}

/** github:/git+ 规格安装更新：重跑 add 重新 pin 最新 main 提交（LOCAL-DEV.md §四）。 */
function performProfileUpdate(profile, opts = {}) {
  return spawnManaged('dsh', ['plugin', '--profile', profile, 'add', 'github:cup113/dsh-pocket-oauth', '-w'], opts);
}

/**
 * 按安装类型分发更新动作（见 detectInstallKind）。unknown 直接拒绝并给重装指引，
 * 不执行任何可能把插件换成 npm 原版的命令。
 * @param {string} profile dsh profile 名（默认 web）
 * @param {{timeoutMs?:number}} [opts] 传给底层受管子进程
 * @param {string} [root] 安装目录（默认本插件目录；测试注入用）
 */
export function performManagedUpdate(profile, opts = {}, root = pkgDir) {
  const kind = detectInstallKind(root);
  if (kind === 'source') return performSourceUpdate(opts, root);
  if (kind === 'git') return performProfileUpdate(profile, opts);
  return Promise.resolve({
    ok: false,
    error: `无法识别安装方式，已拒绝自动更新 | unrecognized install kind (${kind}) — automatic update refused`,
    output: `重装为 GitHub 安装 | reinstall from GitHub: dsh plugin --profile ${profile} add github:cup113/dsh-pocket-oauth -w`,
  });
}

export function apply(ctx, config = {}, internals = {}) {
  const logger = ctx.logger?.(name) ?? console;
  const dshPort = internals.dshPort ?? ctx.webServer?.port;
  if (!dshPort) {
    logger.error('dsh-pocket: webServer port unavailable — cannot start proxy | 拿不到 dsh web 端口，无法启动代理');
    return () => {};
  }

  // 桌面端环境识别（官方兼容模式，见 desktop 的 plugin-development.md）：
  // desktopProfiles / desktopPnpm 只在 DSH Desktop（Electron）里存在。
  // 桌面端有自己的更新/进程管理，我们这两项功能在此环境**关闭**（不删除），
  // 避免与 desktopPnpm / Electron 进程模型冲突；扫码同屏等正常功能照常。
  const isDesktop = internals.isDesktop !== undefined
    ? internals.isDesktop === true
    : ctx.get?.('desktopProfiles') !== undefined || ctx.get?.('desktopPnpm') !== undefined;
  if (isDesktop) {
    logger.info('dsh-pocket: DSH Desktop detected — update/restart disabled here | 检测到桌面端环境，更新/重启已关闭');
  }

  // 桌面端 advanced 模式检测（issue #19）：dsh-plugin-desktop 的 mode 配置存在
  // $DSH_HOME/settings.yaml 的 dsh-plugin-desktop 命名空间下。advanced 组合禁用网页版
  // ui-layout、手机页面又拿不到桌面 layout → 手机访问白屏，这里注入覆盖层提示用户切回。
  const desktopAdvanced = isDesktop && (() => {
    try {
      const raw = readFileSync(join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'settings.yaml'), 'utf8');
      return /dsh-plugin-desktop\s*:\s*[\s\S]{0,300}?mode\s*:\s*advanced/i.test(raw);
    } catch { return false; }
  })();
  if (desktopAdvanced) {
    logger.warn('dsh-pocket: DSH Desktop advanced mode — phone access unsupported, injecting notice | 桌面端 advanced 模式：手机访问暂不支持，已注入提示');
  }

  const service = internals.service ?? createPocketService({
    dshPort,
    // 端口（issue #70）：插件模式优先级 settings.proxyPort > cordis patch config.port > 3081。
    // 3081 被占时 createPocketService 内部 EADDRINUSE 抛错，按 DSH 插件启动失败处理（用户改端口重启即可）。
    port: internals.port ?? config.port ?? (proxyPort() || 3081),
    internals,
    // 桌面端**不再**注入 dsh-desktop-* 标记（issue #76）：详见 lib/proxy.mjs 注释。
    injectHtml: isDesktop
      ? DEFAULT_INJECT + (desktopAdvanced ? advancedNoticeScript() : '')
      : undefined,
    // Gitee OAuth 认证（代替 PIN）：loopback 免认证，其余一律要会话；
    // sessionKey 用函数形式暴露，支持「登出所有设备」在线轮换。
    auth: {
      sessionKey: () => session.key,
      getConfig: internals.getOAuthConfig ?? readOAuthConfig,
      saveConfig: writeOAuthConfig,
      bindUser: bindGiteeUser,
      // 测试注入：覆盖 Gitee 基址 / fetch（与既有 internals.* 注入同一套约定，生产不传）
      ...(internals.oauthTestHooks ?? {}),
    },
    getOAuthConfig: internals.getOAuthConfig ?? readOAuthConfig,
    // dsh web 浏览器会话启动 token（issue #77）：新版 dsh（>= 0.1.2-alpha.1）要求根路径
    // 带一次 `?token=` 换 cookie，否则 /api 与 WebSocket 全 401。token 每次进程启动都变，
    // 所以每次请求实时从 connection 服务取；老版本没有这个方法 → 返回空，行为不变。
    launchToken: () => {
      try {
        const fn = ctx.connection?.authenticatedUrl;
        if (typeof fn !== 'function') return '';
        const url = new URL(fn.call(ctx.connection, `http://127.0.0.1:${dshPort}`));
        return url.searchParams.get('token') ?? '';
      } catch {
        return '';
      }
    },
  });

  const disposers = [];
  const disposeRpc = installPocketRpc(ctx, {
    service,
    desktop: isDesktop,
    getOAuthView: () => oauthView(internals.getOAuthConfig?.() ?? readOAuthConfig()),
    rotateSession: () => rotateSessionKey(),
    unbindOAuth: () => unbindGiteeUser(),
    // 恢复出厂设置：清空设置文件 + 清除 OAuth 配置（凭据与绑定一并清除）
    resetPocket: () => resetPocketState(),
    runUpdate: internals.runUpdate ?? {
      currentVersion,
      perform: performManagedUpdate,
      loadedVersion: () => loadedVersion,
      installKind: () => detectInstallKind(),
    },
    restart: internals.restart ?? (() => pocketRestart()),
    restartNotice: internals.restartNotice ?? consumeRestartNotice,
    log: logger,
  });
  disposers.push(disposeRpc);

  // 代理随插件自动启动（本机 setup 页开箱即用：http://127.0.0.1:<port>/pocket-setup）
  void service.startProxy().then((proxy) => {
    logger.info('dsh-pocket: proxy ready on :%d | 代理已就绪', proxy.port);
  }).catch((err) => {
    logger.error('dsh-pocket: proxy start failed | 代理启动失败: %s', err?.message ?? err);
  });

  ctx.effect(() => async () => {
    for (const d of disposers.reverse()) { try { d(); } catch { /* 忽略 */ } }
    await service.dispose();
  }, 'dsh-pocket: stop proxy');
}

export { name, inject, readRestartNotice, consumeRestartNotice };
