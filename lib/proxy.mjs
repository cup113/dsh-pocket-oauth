// dsh-pocket 核心：Host/Origin 改写反向代理 + OAuth（Gitee / GitHub）访问控制
//
// 为什么需要它：DSH 的 /api 浏览器信任栅栏只认 loopback（127.0.0.1）或
// `--trusted-host` 白名单（且官方禁了 0.0.0.0 绑定，防止把远程执行代码暴露给网络）。
// 本代理把入站请求的 Host / Origin 统一改写成 loopback 权威（127.0.0.1:3080），
// 转发给本机 dsh web——栅栏永远看到 loopback，于是：
//   - 局域网：手机直接访问 http://<电脑IP>:3081
//   - 公网：用户自建隧道（固定域名）指到本代理
// 都不需要改 dsh 的任何配置。
//
// 认证模型（OAuth，Gitee / GitHub 二选一，代替旧 PIN）：
//   - loopback（本机）免认证；
//   - 其余 Host 一律要求会话 cookie（HttpOnly，值 = sha256(boundUid:sessionKey)）；
//   - 会话经 /pocket-oauth/start → 鉴权方授权 → /pocket-oauth/callback（provider 与
//     uid 都与本机绑定的 (provider, boundUid) 比对，一致才种 cookie）获得；
//   - 用哪家换票由 state 记录决定，不看任何请求参数；
//   - /pocket-setup 仅 loopback 可达：选 provider、填 Client ID/Secret 与回调 origin
//     白名单并绑定账号。
//
// 同步保证：普通请求与 WebSocket upgrade（/api/events.host 流式推送）都原样透传，
// 手机看到的界面与电脑完全一致、实时。

import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { createGzip, createBrotliCompress, constants as zlibConstants } from 'node:zlib';
import { randomBytes, timingSafeEqual } from 'node:crypto';

import {
  OAUTH_CALLBACK_PATH,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createStateStore,
  sessionCookieValue,
  normalizeProvider,
  providerInfo,
  providerAuthorizeUrl,
  exchangeCodeForUser,
  parseOrigins,
} from './oauth.mjs';

const DEFAULT_UPSTREAM = { host: '127.0.0.1', port: 3080 };

/**
 * 非安全上下文（http://<LAN-IP>:端口）里浏览器缺两个 API，由代理注入 polyfill
 * （只在缺少时生效，不覆盖原生实现）：
 *   1. crypto.randomUUID——DSH 连接层 mint RPC id 用，缺失直接抛错；
 *   2. AbortSignal.any（issue #53）——Android 厂商浏览器/WebView（Chrome < 116）
 *      无原生实现，DSH 连接层发送消息会调 AbortSignal.any([...])，缺失则消息发不出。
 * 带 data-dsh-pocket-polyfill 标记：注入判重用它，而不是搜索 "crypto.randomUUID"
 * 字样（dsh 页面源码里可能恰好出现该字符串，导致误判为已注入而跳过）。
 */
export const RANDOM_UUID_POLYFILL = `<script data-dsh-pocket-polyfill="1">!function(){try{if(self.crypto&&!self.crypto.randomUUID){self.crypto.randomUUID=function(){var b=new Uint8Array(16);self.crypto.getRandomValues(b);b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h="";for(var i=0;i<16;i++){var x=b[i].toString(16);h+=(x.length<2?"0":"")+x;if(i===3||i===5||i===7||i===9)h+="-";}return h;}}}catch(e){}}();
!function(){try{if(self.AbortSignal&&!self.AbortSignal.any){self.AbortSignal.any=function(signals){var controller=new AbortController();var list=Array.from(signals||[]);var done=false;var handlers=list.map(function(signal){return function(){abort(signal);};});function cleanup(){for(var i=0;i<list.length;i++){try{list[i].removeEventListener('abort',handlers[i]);}catch(e){}}}function abort(signal){if(done)return;done=true;cleanup();try{controller.abort(signal.reason);}catch(e){controller.abort();}}for(var j=0;j<list.length;j++){var sig=list[j];if(sig.aborted){abort(sig);break;}sig.addEventListener('abort',handlers[j],{once:true});}return controller.signal;};}}catch(e){}}();
/* 注：曾用「全局 let location + Proxy」伪装 location.hostname 修 DSH isLoopback 判定
（issue #58：局域网访问模型设置页报 settings unavailable）——但 let location 全局
词法绑定会让任何恰好顶层声明 location 的脚本（DSH 插件经典 script）SyntaxError 崩溃，
导致会话列表不显示（实测 PAGEERROR: Identifier 'location' has already been declared）。
已回退；该问题属 DSH 客户端限制（location.hostname 是 unforgeable 属性）无法安全绕过。*/</script>`;

/**
 * issue #96：dsh 0.1.1-rc.2 起，`@deepseek-ai/dsh-client-connection` 的连接层改成
 *   const api = fixtureClient ?? transport?.createApiClient() ?? new WebApiClient()
 * 其中 transport = globalThis.__DSH_TRANSPORT__（由 DSH 宿主 web shell 注入，本仓库
 * 全程不创建、不引用这个全局）。桌面直连 127.0.0.1:3080 时宿主给的 transport 带
 * createApiClient；经本代理（局域网 / 隧道域名）访问时宿主给的 transport 不带该方法
 * → 手机上一执行就 TypeError: transport?.createApiClient is not a function，整页崩。
 *
 * 兜底策略：只在该方法缺失时补一个返回 null 的实现。null 会触发宿主自己那条
 * `?? new WebApiClient()` 兜底分支，等于让连接层回到旧版本（0.1.1-rc.2 之前）的
 * 行为。宿主自己有实现时一律不覆盖。
 *
 * 这是 stopgap 不是根治：真正的契约缺口在 DSH 宿主，需上游修复。
 */
export const TRANSPORT_API_CLIENT_SHIM = `<script data-dsh-pocket-transport-shim="1">!function(){try{var K='__DSH_TRANSPORT__',cur=globalThis[K];function patch(t){try{if(t&&typeof t==='object'&&typeof t.createApiClient!=='function'){try{Object.defineProperty(t,'createApiClient',{value:function(){return null;},writable:true,configurable:true});}catch(e){try{t.createApiClient=function(){return null;};}catch(e2){}}}}catch(e){}return t;}if(cur)patch(cur);Object.defineProperty(globalThis,K,{configurable:true,enumerable:true,get:function(){return cur;},set:function(t){cur=patch(t);}});}catch(e){}}();</script>`;

const INJECT_MARK = 'data-dsh-pocket-polyfill="1"';

/**
 * DSH Desktop（桌面版）渲染进程兼容补丁（issue #3/#4，已于 issue #76 停用）。
 *
 * 历史：旧版 dsh-plugin-desktop 的 client 在页面加载时从 URL query 读
 * `dsh-desktop-mode` 与 `dsh-desktop-platform`，缺失即抛
 * "invalid or missing dsh-desktop-mode null" → 页面崩（手机扫码访问桌面版时正是如此）。
 * 本脚本用 history.replaceState 补上这两个参数（无跳转、不重载），取最轻的
 * `compatibility` 模式——不激活桌面布局，避免与移动端适配叠加。
 *
 * @deprecated 不要再注入（issue #76，DSH Desktop 2.0.3 起）：
 *   ① mode 与 platform **同时缺失**时，parseDesktopClientEnvironment 直接返回 undefined
 *      （视作非桌面外壳，跳过全部桌面逻辑），正是手机/浏览器页面需要的效果；
 *   ② 只要 URL 上出现任一 dsh-desktop-* 标记，客户端就强制校验整组（material +
 *      semver version + mica），只补两个必然抛 "invalid or missing dsh-desktop-material"
 *      → 插件树加载失败 → 页面变成「打开恢复模式」；
 *   ③ 更糟的是，decideDesktopBrowserAccess 见到 dsh-desktop-* 前缀就把没有渲染器 token 的
 *      普通浏览器判为 denied（403），刷新后直接打不开。
 * lib/index.js 已不再注入本脚本；保留导出仅为兼容旧版本桌面端与既有测试。
 */
export function desktopEnvPatchScript(platform) {
  const p = ['darwin', 'win32', 'linux'].includes(platform) ? platform : 'linux';
  return `<script data-dsh-pocket-desktop-patch="1">!function(){try{var s=new URLSearchParams(location.search);if(!s.has('dsh-desktop-mode')||!s.has('dsh-desktop-platform')){s.set('dsh-desktop-mode','compatibility');s.set('dsh-desktop-platform','${p}');var u=new URL(location.href);u.search=s.toString();history.replaceState(null,'',u);}}catch(e){}}();</script>`;
}

/** 上游响应是否压缩过（压缩流不能做文本注入，会损坏页面）。 */
function isCompressed(headers) {
  return /(^|,\s*)(gzip|br|deflate)(\s*,|$)/i.test(String(headers['content-encoding'] ?? ''));
}

/**
 * 默认注入到经代理的 HTML 文档里：crypto.randomUUID / AbortSignal.any polyfill
 * （非安全上下文必需）+ issue #96 的 transport.createApiClient 兜底。
 */
export const DEFAULT_INJECT = RANDOM_UUID_POLYFILL + TRANSPORT_API_CLIENT_SHIM;

/**
 * DSH Desktop advanced 模式不支持的提示覆盖层（issue #19）。
 * advanced 组合会禁用网页版 ui-layout，而桌面 layout 只在 advanced client 提供——
 * 手机页面被注入 compatibility 后无任何 layout 服务 → 启动白屏（Failed to load plugins）。
 * 该脚本在页面上叠加一个固定警告层，让用户明确知道原因（而不是无解白屏）。
 */
export function advancedNoticeScript() {
  return `<script data-dsh-pocket-advanced-notice="1">!function(){try{var d=document.createElement('div');d.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);color:#fff;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:24px';d.textContent='DSH 桌面端处于 advanced 模式，手机访问暂不支持。请在桌面端设置中切回 compatibility 模式后重启。| DSH Desktop is in advanced mode — phone access is not supported yet. Switch back to compatibility in the desktop app and restart.';document.documentElement.appendChild(d);}catch(e){}}();</script>`;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Host 信任边界分类（fail closed）。
 *
 * 早期实现只认某一类隧道的域名后缀为「公网」，其余一律当局域网——用户自建
 * 命名隧道/反向代理指向本机端口时，固定域名被误判成局域网；若局域网免密开
 * 着，公网入口就无密码裸奔。现在反转为 fail closed：
 *   - loopback：localhost / 127.x / ::1 / 0.0.0.0（本机，免认证）
 *   - lan：RFC1918 私网 IPv4、CGNAT 100.64/10（RFC 6598，Tailscale/ZeroTier 默认网段，
 *     公网不可路由）、IPv6 ULA/link-local、`.local`（mDNS）、无点单标签名（NetBIOS 计算机名等）
 *   - public：其余一切 Host（任何陌生域名）→ 强制认证
 *
 * @returns {'loopback'|'lan'|'public'}
 */
export function classifyHost(host) {
  let name = String(host ?? '').trim().toLowerCase();
  if (name.startsWith('[')) {
    const end = name.indexOf(']');
    if (end >= 0) name = name.slice(1, end); // [::1]:3081 → ::1
  } else {
    name = name.replace(/:\d+$/, ''); // hostname:3081 / 127.0.0.1:3081 → 去掉端口
  }
  if (name === 'localhost' || name === '0.0.0.0' || name === '::1' || /^127\./.test(name)) return 'loopback';
  // RFC1918 私网 + CGNAT 100.64/10（RFC 6598，Tailscale/ZeroTier 默认网段，公网不可路由）
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/.test(name)) return 'lan';
  if (/^(?:fe80:|f[cd][0-9a-f]{2}:)/.test(name) && name.includes(':')) return 'lan'; // IPv6 link-local / ULA
  if (name === '' || name.includes(':')) return 'loopback'; // 裸 IPv6 / 无 Host → 当本机
  if (name.endsWith('.local') || !name.includes('.')) return 'lan'; // mDNS / NetBIOS 单标签名
  return 'public';
}

/** 保护强度序：本机最弱（免认证）→ 其余（一律要求 OAuth 会话）。 */
const HOST_CLASS_RANK = { loopback: 0, lan: 1, public: 2 };

/**
 * 按 TCP 源地址给出来源类别（issue #90）。
 * 与 classifyHost 的区别在**兜底方向**：Host 头里认不出的形态按 loopback 处理
 * （历史行为，避免裸 IPv6 之类把本机访问判成公网）；而源地址认不出时必须按
 * public 处理——源地址是我们唯一不可伪造的信息，兜底方向错了整条防线就白搭。
 * @returns {'loopback'|'lan'|'public'|null} null 表示拿不到源地址（不做任何收紧）
 */
export function classifySource(addr) {
  let a = String(addr ?? '').trim().toLowerCase();
  if (!a) return null;
  if (a.startsWith('::ffff:')) a = a.slice(7); // IPv4-mapped IPv6（Node 双栈监听时常见）
  if (a === '::1' || /^127\./.test(a)) return 'loopback';
  // RFC1918 私网 + CGNAT 100.64/10（与 classifyHost 保持同一套网段判定）
  if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/.test(a)) return 'lan';
  if (/^169\.254\./.test(a)) return 'lan';            // IPv4 link-local
  if (/^(?:fe80:|f[cd][0-9a-f]{2}:)/.test(a)) return 'lan'; // IPv6 link-local / ULA
  return 'public';
}

/**
 * 用于策略判定的 Host（issue #90 第 7 条）。
 *
 * Host 头完全由客户端控制：能直连代理端口的人只要写 `Host: 127.0.0.1:3081`
 * 就会被 classifyHost 判成本机，从而绕过认证——这就是一条零认证通道。
 * TCP 源地址无法伪造，用它给 Host 声明设一个下限。
 *
 * **只收紧、绝不放松**：经自建隧道（守护进程跑在本机）进来的公网请求源地址
 * 正是 127.0.0.1，若按源地址覆盖就会把公网访问降级成本机免密，比原来的问题更
 * 严重。所以仅当声明的保护级别**低于**来源真实级别时，才改用源地址参与判定。
 */
export function policyHost(req, host) {
  const actual = classifySource(req?.socket?.remoteAddress);
  if (!actual) return host;
  const claimed = classifyHost(host);
  if (HOST_CLASS_RANK[actual] <= HOST_CLASS_RANK[claimed]) return host;
  // 用真实源地址替代被伪造的 Host 参与后续全部策略判定，保证各处判定看到的是
  // 同一个来源。
  let addr = String(req.socket.remoteAddress);
  if (addr.toLowerCase().startsWith('::ffff:')) addr = addr.slice(7);
  return addr;
}

/**
 * 该 Host 是否 loopback（本机）。
 * 本机访问免认证（能在本机直连本来就说明已经上了这台机器）。
 * 注意：自建隧道/反代请保持原域名 Host 转发（主流隧道默认如此）；
 * 若反代把 Host 改写成 127.0.0.1，公网流量会被误判为本机（README 有说明）。
 */
function isLoopbackHost(host) {
  let name = String(host ?? '').trim().toLowerCase();
  if (name.startsWith('[')) {
    const end = name.indexOf(']');
    if (end >= 0) name = name.slice(1, end); // [::1]:port → ::1
  } else {
    name = name.replace(/:\d+$/, ''); // hostname:port / 127.0.0.1:port → 去掉端口
  }
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name === '0.0.0.0';
}

/** 桌面端浏览器访问门禁提示页（issue #81）：DSH Desktop 未开启「浏览器访问」时，
 *  上游 desktop-browser-access 门禁对普通浏览器（含经本代理转发的手机）返回 403
 *  `forbidden`，且本代理无法携带 Electron renderer secret 绕过。对符合该特征的
 *  浏览器导航请求返回此可操作提示页；API/WS 与其余 403 原样透传。 */
function desktopAccessBlockedPageHtml() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH Pocket · 桌面端未开启浏览器访问</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px;max-width:392px;width:calc(100% - 48px);text-align:center}
h1{font-size:16px;margin:0 0 8px;color:#111827}
p{font-size:13px;color:#6b7280;margin:0 0 12px;line-height:1.6}
code{background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:12px;color:#374151}
.step{text-align:left;background:#f9fafb;border:1px solid #eef2f7;border-radius:10px;padding:12px 14px;margin-top:8px;font-size:12px;color:#4b5563;line-height:1.8}
</style></head><body><div class="card">
<h1>🖥️ DSH Pocket</h1>
<p>你已通过账号登录，但页面仍被拦截。<br>因为本机 DSH Desktop 未开启「浏览器访问」，桌面门禁拒绝了普通浏览器（含手机）的页面请求。</p>
<div class="step">
<strong>解决方法（任选其一）：</strong><br>
1. DSH Desktop → 设置 → 窗口 / 模式 → 开启「浏览器访问」（自动切到 compatibility 模式）→ <strong>重启 DSH Desktop</strong>。<br>
2. 或在配置文件中设置：<br>
<code>dsh-desktop: { mode: compatibility, openBrowser: true }</code><br>
然后重启 DSH Desktop，再刷新本页。
</div>
<p style="margin-top:14px">注意：账号登录成功 ≠ 已获得桌面 Web 访问授权。门禁由 DSH Desktop 控制，pocket 无法代为绕过。</p>
<p style="color:#9ca3af">The host DSH Desktop has "browser access" disabled. Enable it (Settings → window/mode → browser access → restart), or set <code>dsh-desktop.mode: compatibility, openBrowser: true</code>, then refresh.</p>
</div></body></html>`;
}

/** 请求是否期望 HTML（浏览器导航 → 返回登录页；API/WS → 401）。 */
function isHtmlRequest(req) {
  const accept = String(req.headers.accept ?? '');
  if (accept.includes('text/html')) return true;
  const url = String(req.url ?? '');
  // 按 pathname 判断，别用 `url === '/'` 严格比 —— 根路径常带 query
  // （`/?dsh-pocket-auth=1`、`/?dsh-pocket-retry=1`、`/?token=…`），
  // 那些同样是浏览器导航，漏判会让它们拿到 401/303 而不是该给的页面。
  let pathname = url;
  try { pathname = new URL(url || '/', 'http://dsh.invalid').pathname; } catch { /* 用原值兜底 */ }
  return pathname === '/' || /\.html?$/i.test(pathname);
}

/**
 * 常量时间的字符串比较（issue #90 精神保留）：普通 `===` 会在首个不同字节处提前
 * 返回，理论上可被计时侧信道逐字节还原。长度不同直接判否（长度本身不是秘密），
 * 等长则走 timingSafeEqual。
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** HTML 文本/属性转义（配置值回填表单用）。 */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * 把浏览器可见的权威改写成 loopback 权威。
 * 除 Host/Origin 外，还必须规范化 Referer 与 Sec-Fetch-Site：DSH 宿主的特权方法
 * 栅栏（settings.describe/credentials.* 等 PRIVILEGED_METHODS）会拒绝
 * sec-fetch-site === 'cross-site'，并校验 Origin 与 Host 匹配；远程访问的这两个头
 * 若不改写，设置/凭据平面会在宿主侧被 403（issue #58 的另一半）。
 * 统一小写化键名，避免 Node 原样转发时大小写键并存导致重复头。
 */
function loopbackAuthority(headers, upstream) {
  const authority = `${upstream.host}:${upstream.port}`;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'origin' || lk === 'referer' || lk === 'sec-fetch-site') continue;
    out[lk] = v;
  }
  out.host = authority;
  out.origin = `http://${authority}`;
  const referer = headers.referer ?? headers.Referer;
  if (referer) {
    try {
      const ref = new URL(referer);
      ref.protocol = 'http:';
      ref.host = authority;
      out.referer = ref.toString();
    } catch {
      out.referer = `http://${authority}/`;
    }
  }
  out['sec-fetch-site'] = 'same-origin';
  return out;
}

// ---------- dsh web 浏览器会话 token（issue #77） ----------
// 新版 dsh web（>= 0.1.2-alpha.1）给浏览器会话加了启动 token：根路径 `GET /` 必须带一次
// `?token=<启动 token>` 换一个绑定 authority 的 cookie，之后 /api 与 WebSocket 才放行；
// 否则一律 401（"dsh web authentication required"）。手机扫码进来的 URL 天然没有这个
// token，所以代理要在转发时补一次。
//
// 只在 `GET /` 且请求还没带 dsh-auth-* cookie 时注入：上游拿到 token 会 303 回干净的根
// 路径，若每次都注入就会 303 循环（浏览器很快报"重定向次数过多"）。
const DSH_AUTH_COOKIE = 'dsh-auth-';
/**
 * 去掉 URL 上所有 `dsh-desktop-*` query 参数（issue #75）。
 *
 * dsh-pocket 在 ≤ 2.1.1 会用 `history.replaceState` 往页面 URL 上写
 * `dsh-desktop-mode=compatibility` 和 `dsh-desktop-platform=<系统>`
 * （desktopEnvPatchScript，已在 2.1.2 删除）。副作用是：用户当时收藏/保存过
 * 的那个地址**一直带着这两个参数**。升级之后我们不再注入了，但用户打开旧
 * 收藏时 URL 里仍然有 —— 上游 `decideDesktopBrowserAccess` 只要见到
 * `dsh-desktop-` 前缀就认定是渲染器请求，普通浏览器没有渲染器 token，直接
 * 403 forbidden。表现就是「我已经升到最新版了，还是 forbidden」。
 *
 * 脏参数是我们写进去的，就得由我们清掉。所有方法、所有路径都清理（不只是
 * `GET /`）——API 与 WebSocket 握手带上这些参数同样会被拦。
 *
 * @param {string} reqUrl - 原始请求路径（含 query）。
 * @returns {string} 清理后的路径；无该前缀参数或解析失败时原样返回。
 */
export function stripDesktopMarkers(reqUrl) {
  let u;
  try {
    u = new URL(reqUrl ?? '/', 'http://dsh.invalid');
  } catch {
    return reqUrl;
  }
  const doomed = [...u.searchParams.keys()].filter((k) => k.startsWith('dsh-desktop-'));
  if (doomed.length === 0) return reqUrl;
  for (const key of doomed) u.searchParams.delete(key);
  return `${u.pathname}${u.search}`;
}

export function upstreamPathWithLaunchToken(reqUrl, method, cookieHeader, launchToken) {
  if (method !== 'GET') return reqUrl;
  let u;
  try { u = new URL(reqUrl ?? '/', 'http://dsh.invalid'); } catch { return reqUrl; }
  if (u.pathname !== '/') return reqUrl;
  // 登录成功后跳回的 `/?dsh-pocket-auth=1`：强制重做一次握手（旧 cookie 可能已过期/被撤销）
  const force = u.searchParams.has('dsh-pocket-auth');
  if (!force && String(cookieHeader ?? '').includes(DSH_AUTH_COOKIE)) return reqUrl;
  if (!launchToken) return reqUrl;
  u.searchParams.set('token', launchToken);
  return `${u.pathname}${u.search}`;
}

// ---------- 会话握手重试计数（issue #91） ----------
// Safari（iOS/macOS）不持久化「http:// + 纯 IP 源」上由 3xx 响应下发的 cookie，
// 于是 dsh web 的 launch-token→cookie 握手永远收敛不了：代理每次 `GET /`
// 都补 `?token=`，上游每次 303 回 `/`，浏览器每次都不带 cookie → 无限重定向
// （Safari 报「发生了太多重定位」）。
//
// 两道防线：
//   1) 代理把这次 303 改写成 200 过渡页（Set-Cookie 照发 + meta refresh 跳回 `/`），
//      200 响应上的 cookie 不会被 Safari 的重定向 cookie 策略丢掉；
//   2) 万一 1) 也不管用，用下面的计数器在若干次尝试后停止注入 token 并给出
//      可操作提示页——宁可给用户一句人话，也不要无限转圈。
//
// 只按客户端 IP 计数（无需 cookie 支持，正适合「cookie 用不了」的这个场景）。
export const DEFAULT_HANDSHAKE_LIMIT = 3;
export const HANDSHAKE_WINDOW_MS = 60_000;
/** 提示页「重试」按钮用的查询参数：命中即清空该 IP 的失败计数，且不往上游透传。 */
export const HANDSHAKE_RETRY_PARAM = 'dsh-pocket-retry';

/** 摘掉某个查询参数后重新拼路径；解析失败或本来就没有则原样返回。 */
export function stripQueryParam(reqUrl, name) {
  let u;
  try { u = new URL(reqUrl ?? '/', 'http://dsh.invalid'); } catch { return reqUrl; }
  if (!u.searchParams.has(name)) return reqUrl;
  u.searchParams.delete(name);
  return `${u.pathname}${u.search}`;
}

export function createHandshakeTracker({ max = DEFAULT_HANDSHAKE_LIMIT, windowMs = HANDSHAKE_WINDOW_MS } = {}) {
  /** ip -> { count, start } */
  const hits = new Map();
  return {
    /** 记一次握手注入，返回窗口内的累计次数。 */
    record(ip, now = Date.now()) {
      const rec = hits.get(ip);
      if (!rec || now - rec.start > windowMs) {
        hits.set(ip, { count: 1, start: now });
        return 1;
      }
      rec.count += 1;
      return rec.count;
    },
    /** 握手成功（拿到会话 cookie 的请求）→ 清零。 */
    clear(ip) {
      hits.delete(ip);
    },
    /** 该 IP 是否已达重试上限。 */
    exhausted(ip) {
      const rec = hits.get(ip);
      return !!rec && rec.count >= max;
    },
    /** 清理过期条目，防长期运行内存膨胀。 */
    prune(now = Date.now()) {
      for (const [ip, rec] of hits) {
        if (now - rec.start > windowMs) hits.delete(ip);
      }
    },
  };
}

/** 握手过渡页：200 + Set-Cookie（由调用方带上）+ meta refresh 跳回干净根路径。 */
export function handshakePageHtml() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0; url=/">
<title>DSH Pocket · 正在进入 | opening…</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
p{font-size:13px;color:#6b7280;margin:0}
</style></head><body><p>正在进入… | opening…</p></body></html>`;
}

/** 握手反复失败时的提示页（issue #91）：说清原因并给出可操作的规避办法。 */
export function handshakeBlockedPageHtml() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DSH Pocket · 无法完成登录握手</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px 22px;max-width:380px;width:calc(100% - 40px)}
h1{font-size:15px;margin:0 0 10px;color:#111827}
p{font-size:13px;color:#6b7280;margin:0 0 10px;line-height:1.7}
code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:12px}
a{color:#4f6ef7}
</style></head><body><div class="card">
<h1>🔁 无法完成登录握手</h1>
<p>浏览器没有保存 DSH 下发的会话 cookie，代理反复重试后仍未成功，因此停在这里而不是无限跳转。</p>
<p><strong>Safari（iOS/macOS）</strong> 在 <code>http://</code> 纯 IP 地址上不会保存这类 cookie，局域网入口因此进不去。</p>
<p>可以试试：<br>
① 换 Chromium 系浏览器（Chrome / Edge）打开局域网地址；<br>
② 改用 <code>https://</code> 的固定域名入口（自建隧道）——HTTPS 域名上 Safari 正常。</p>
<p style="margin-top:14px"><a href="/?${HANDSHAKE_RETRY_PARAM}=1" style="display:inline-block;padding:8px 14px;background:#4f6ef7;color:#fff;border-radius:8px;text-decoration:none;font-size:13px">重试一次 | Retry</a></p>
<p style="color:#9ca3af;font-size:12px">Browser did not keep the session cookie, so the login handshake could not complete (issue #91). Safari over plain <code>http://</code> + IP is the known case — try Chrome, or use an HTTPS fixed-domain entry.</p>
</div></body></html>`;
}

// ---------- OAuth 页面（Gitee / GitHub 二选一，代替旧 PIN 登录页） ----------

/** 页面骨架：与旧登录页同一套极简样式。 */
function pageHtml(title, bodyHtml) {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px;max-width:400px;width:calc(100% - 48px);text-align:center}
h1{font-size:16px;margin:0 0 8px;color:#111827}
p{font-size:13px;color:#6b7280;margin:0 0 10px;line-height:1.7}
a.btn{display:inline-block;padding:10px 20px;font-size:15px;background:#4f6ef7;color:#fff;border:none;border-radius:8px;cursor:pointer;text-decoration:none}
code{background:#f3f4f6;padding:2px 6px;border-radius:6px;font-size:12px;color:#374151;word-break:break-all}
ul{text-align:left;font-size:12px;color:#6b7280;line-height:1.8;margin:8px 0;padding-left:18px}
input,textarea{width:100%;box-sizing:border-box;padding:9px 11px;font-size:14px;border:1px solid #d1d5db;border-radius:8px;outline:none;margin:4px 0 10px;font-family:inherit}
input[type=radio]{width:auto;margin:0 6px 0 0}
input:focus,textarea:focus{border-color:#4f6ef7}
label{display:block;text-align:left;font-size:12px;color:#4b5563;margin-top:8px}
button{width:100%;padding:10px;font-size:15px;background:#4f6ef7;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-top:6px}
.err{color:#dc2626;font-size:12px;margin:6px 0;min-height:16px}
.muted{font-size:12px;color:#9ca3af;line-height:1.6}
.prov{text-align:left;margin:2px 0 6px}
.prov label{display:inline-block;margin:0 12px 0 0;font-size:13px;color:#111827}
.prov .muted{margin:2px 0 8px}
</style></head><body><div class="card">${bodyHtml}</div></body></html>`;
}

/** provider 的展示名（'Gitee' / 'GitHub'）。 */
function labelOf(provider) {
  return providerInfo(provider).label;
}

/** 登录页：当前 provider 的 OAuth 入口。 */
function oauthLoginPageHtml(provider = 'gitee') {
  const label = labelOf(provider);
  return pageHtml('DSH Pocket · 登录', `
<h1>🔐 DSH Pocket</h1>
<p>本地址受 ${label} 登录保护<br>This address is protected by ${label} sign-in</p>
<a class="btn" href="/pocket-oauth/start">使用 ${label} 账号登录<br>Sign in with ${label}</a>
<p class="muted" style="margin-top:12px">只有在本机绑定的 ${label} 账号可以进入——就是创建 OAuth 应用的那个账号，全程只需一个账号<br>Only the ${label} account bound on this machine may enter — the very account that owns the OAuth app; one account is all you need</p>`);
}

/** 未初始化提示页（fail closed 的可操作出口）：两家创建入口并列。 */
function unconfiguredPageHtml(setupUrl) {
  return pageHtml('DSH Pocket · 尚未初始化', `
<h1>⚙️ DSH Pocket</h1>
<p>本机还没有完成 OAuth 初始化，所有远程访问均已关闭（fail closed）。<br>This machine has not finished OAuth setup; all remote access is closed.</p>
<ul>
<li>① 二选一创建 OAuth 应用：<strong>Gitee</strong> <code>${providerInfo('gitee').appUrl}</code>（勾选 <code>${providerInfo('gitee').scope}</code>）或 <strong>GitHub</strong> <code>${providerInfo('github').appUrl}</code>（默认 <code>${providerInfo('github').scope}</code> 即可）。回调地址填 <code>${OAUTH_CALLBACK_PATH}</code> 结尾的完整 URL（可注册多个）</li>
<li>② 在<strong>本机</strong>浏览器打开 <code>${escapeHtml(setupUrl)}</code>，选择 Gitee 或 GitHub 后填入 Client ID / Secret 并绑定账号</li>
</ul>`);
}

/** 已存凭据但未绑定：继续在 setup 页点「绑定」。 */
function unboundPageHtml(setupUrl, provider = 'gitee') {
  const label = labelOf(provider);
  return pageHtml('DSH Pocket · 待绑定账号', `
<h1>🔗 DSH Pocket</h1>
<p>Client 凭据已保存，但还没有绑定 ${label} 账号。<br>Credentials saved, but no ${label} account is bound yet.</p>
<p>在本机浏览器打开 <code>${escapeHtml(setupUrl)}</code>，点击「保存并绑定账号」完成最后一步（用创建应用时的<strong>同一个</strong> ${label} 账号授权）。<br>Open it on this machine and click "Save &amp; bind account" — authorize with the same account that owns the OAuth app.</p>`);
}

/** 白名单外 origin 的引导页。 */
function originNotAllowedPageHtml(allowed, provider = 'gitee') {
  const label = labelOf(provider);
  const list = (allowed ?? []).map((o) => `<li><code>${escapeHtml(o)}</code></li>`).join('');
  return pageHtml('DSH Pocket · 请使用配置的访问地址', `
<h1>🧭 DSH Pocket</h1>
<p>当前访问的地址不在回调白名单里，无法发起 ${label} 登录。<br>This origin is not in the callback allowlist.</p>
<p>请改用以下地址访问（或在 ${label} 应用与本机 /pocket-setup 中同时登记当前地址）：</p>
<ul>${list || '<li>（未配置）</li>'}</ul>`);
}

/** state 无效/过期。 */
function stateInvalidPageHtml() {
  return pageHtml('DSH Pocket · 登录状态失效', `
<h1>⏱️ DSH Pocket</h1>
<p>登录会话已过期或无效，请重新发起登录。<br>The login state is expired or invalid — please try again.</p>
<a class="btn" href="/pocket-oauth/start">重新登录 | Retry</a>`);
}

/** 鉴权方返回错误（用户拒绝授权等）。 */
function oauthDeniedPageHtml(detail, provider = 'gitee') {
  const label = labelOf(provider);
  return pageHtml('DSH Pocket · 授权未完成', `
<h1>🚫 DSH Pocket</h1>
<p>${label} 授权未完成${detail ? `：<code>${escapeHtml(detail)}</code>` : ''}<br>${label} authorization did not complete.</p>
<a class="btn" href="/pocket-oauth/start">重新登录 | Retry</a>`);
}

/** 账号不匹配：不是本机绑定的账号（provider 或 uid 任一不符）。 */
function oauthMismatchPageHtml(login, provider = 'gitee') {
  const label = labelOf(provider);
  return pageHtml('DSH Pocket · 账号未绑定', `
<h1>⛔ DSH Pocket</h1>
<p>当前登录的 ${label} 账号 <strong>${escapeHtml(login || '未知')}</strong> 未绑定本机，访问被拒绝。<br>This ${label} account is not bound to this machine.</p>
<p>如需换绑，请在<strong>本机</strong>打开 <code>/pocket-setup</code> 重新绑定。</p>`);
}

/** 换票/取用户失败等内部错误。 */
function oauthErrorPageHtml(message, provider = 'gitee') {
  const p = providerInfo(provider);
  return pageHtml('DSH Pocket · 登录失败', `
<h1>❌ DSH Pocket</h1>
<p>登录过程中出现错误：<br><code>${escapeHtml(message)}</code></p>
<a class="btn" href="/pocket-oauth/start">重试 | Retry</a>
<p class="muted">若持续失败，请检查网络能否访问 ${p.base.replace(/^https?:\/\//, '')}${p.apiBase ? ` 与 ${p.apiBase.replace(/^https?:\/\//, '')}` : ''}，以及 Client ID / Secret / 回调地址是否与 ${p.label} 应用一致。</p>`);
}

/** 绑定成功页。 */
function bindSuccessPageHtml(login, provider = 'gitee') {
  const label = labelOf(provider);
  return pageHtml('DSH Pocket · 绑定成功', `
<h1>✅ 绑定成功</h1>
<p>已绑定 ${label} 账号 <strong>${escapeHtml(login)}</strong>。<br>Bound to ${label} account <strong>${escapeHtml(login)}</strong>.</p>
<p>此后用该账号经任意白名单地址登录即可访问。</p>
<a class="btn" href="/">进入 | Enter</a>`);
}

/**
 * 请求来源是否可信（CSRF 防护）。
 *
 * 攻击场景：恶意网页向 `http://127.0.0.1:3081/pocket-setup/save` 发一个普通表单 POST——
 * 浏览器按 URL 写 `Host: 127.0.0.1:3081`，TCP 源地址也是 loopback，两道「本机」检查都
 * 会放行，于是攻击者能改写 Client 凭据/回调白名单并解绑账号（拒绝服务 + 配置篡改）。
 * 这里再校验浏览器可控的两项来源元数据：
 *   - `Sec-Fetch-Site: cross-site` → 拒（现代浏览器都会带）；
 *   - `Origin` 存在且与请求 Host 不同 → 拒（同源 POST 的 Origin 恒等于自身 origin）。
 * 两项都缺失时（老浏览器、curl 等）放行，由表单 nonce 兜底——不牺牲可用性。
 *
 * 注意：OAuth 回调（`/pocket-oauth/callback`）**不能**走这个检查——它本来就是鉴权方
 * 跨站跳回来的；那条路径的 CSRF 防线是单次使用的 `state`。
 */
function isSameSiteRequest(req) {
  const site = String(req.headers['sec-fetch-site'] ?? '').trim().toLowerCase();
  if (site === 'cross-site') return false;
  const origin = String(req.headers.origin ?? '').trim();
  if (origin && origin !== 'null') {
    try {
      if (new URL(origin).host.toLowerCase() !== String(req.headers.host ?? '').trim().toLowerCase()) return false;
    } catch {
      return false; // Origin 解析不了 → 保守拒绝
    }
  }
  return true;
}

/** 来源不可信时的提示页（跨站请求被拒）。 */
function untrustedOriginPageHtml() {
  return pageHtml('DSH Pocket · 请求来源不可信', `
<h1>🛡️ DSH Pocket</h1>
<p>该操作只能从<strong>本机的初始化页面</strong>发起，当前请求来自其它网页，已被拒绝。<br>
This action must be initiated from the local setup page — cross-site requests are refused.</p>
<p>请在本机浏览器的地址栏直接打开初始化页面后重试。</p>`);
}

/** setup 初始化页（仅 loopback）。secret 已保存时留空 = 保持不变。
 *  port 用于示例地址——必须与真实监听端口一致，否则用户照着填的回调地址对不上。
 *  nonce 是进程级随机值：跨站页面读不到它，因此无法伪造通过校验的表单提交。
 *  provider 单选（Gitee 默认 / GitHub）：换 provider 即换一家鉴权，需重新绑定。 */
function setupPageHtml(cfg, error, port = 3081, nonce = '') {
  const origins = (cfg?.callbackOrigins ?? []).join('\n');
  const hasSecret = Boolean(cfg?.clientSecret);
  const provider = normalizeProvider(cfg?.provider);
  const gp = providerInfo('gitee');
  const hp = providerInfo('github');
  const cbExample = `http://127.0.0.1:${port}${OAUTH_CALLBACK_PATH}`;
  return pageHtml('DSH Pocket · 初始化', `
<h1>⚙️ DSH Pocket 初始化</h1>
<p class="muted">① 二选一创建 OAuth 应用，「回调地址」登记（可多条，须逐字符一致）：<code>&lt;访问地址&gt;${OAUTH_CALLBACK_PATH}</code><br>
例如 <code>${cbExample}</code>（本机）、<code>https://你的固定域名${OAUTH_CALLBACK_PATH}</code>（隧道）、<code>http://局域网IP:${port}${OAUTH_CALLBACK_PATH}</code><br>
② 下方「访问地址」与创建应用时填的回调地址填<strong>相同内容</strong>即可——整条复制过来也行（结尾的 <code>${OAUTH_CALLBACK_PATH}</code> 会自动去掉）。保存后跳转授权，用<strong>同一个</strong>账号授权完成绑定。</p>
<form method="post" action="/pocket-setup/save">
<input type="hidden" name="nonce" value="${escapeHtml(nonce)}">
<label>鉴权方（选一家）</label>
<div class="prov">
<label><input type="radio" name="provider" value="gitee" ${provider === 'gitee' ? 'checked' : ''}> Gitee（默认）</label>
<div class="muted">在 <code>${gp.appUrl.replace(/^https?:\/\//, '')}</code> 创建应用，权限勾选 <code>${gp.scope}</code>。</div>
<label><input type="radio" name="provider" value="github" ${provider === 'github' ? 'checked' : ''}> GitHub</label>
<div class="muted">在 <code>${hp.appUrl.replace(/^https?:\/\//, '')}</code> 创建 OAuth App（免审核），默认 <code>${hp.scope}</code> 权限即可；授权与取用户走 <code>github.com</code> 与 <code>api.github.com</code>，需能出网访问。</div>
</div>
<label>Client ID</label>
<input name="client_id" value="${escapeHtml(cfg?.clientId ?? '')}" required>
<label>Client Secret${hasSecret ? '（已保存；留空 = 保持不变）' : ''}</label>
<input name="client_secret" type="password" placeholder="${hasSecret ? '••••••••' : 'OAuth 应用的 Client Secret'}" ${hasSecret ? '' : 'required'}>
<label>访问地址（与 OAuth 应用的回调地址填相同内容；每行一个，最多 10 条）</label>
<textarea name="origins" rows="4" placeholder="http://127.0.0.1:${port}&#10;https://pocket.example.com" required>${escapeHtml(origins)}</textarea>
<div class="err">${escapeHtml(error ?? '')}</div>
<button type="submit">保存并绑定账号</button>
</form>
<p class="muted">两边填相同内容即可：直接把创建应用时的回调地址整条复制过来（结尾的 <code>${OAUTH_CALLBACK_PATH}</code> 会自动去掉），或填「协议://主机[:端口]」；含协议与端口，须逐字符一致。换鉴权方（Gitee ⇄ GitHub）需重新绑定账号。</p>`);
}

// ---------- WebSocket 心跳注入（PR #41，issue #29） ----------
// DSH 客户端与宿主的 WebSocket downlink 都不发 ping/pong（客户端只读流、
// 宿主只推帧），空闲连接会被路由器 NAT 空闲超时或手机系统省电机制**静默**
// 丢弃：没有 FIN/RST，浏览器收不到 close 事件，dsh-client-connection 也就
// 永远不会重连——手机页面看起来还开着，实则实时通道已死（消息不同步、
// 点击会话卡在加载）。
//
// 代理在每个透传的 WS 连接上定期向浏览器侧发送协议层 Ping（0x89 0x00，
// server→client 不掩码）：
//   - 浏览器网络栈按 RFC 6455 自动回 Pong（不经过任何 JS），一来一回让
//     双向都有流量，NAT/防火墙空闲超时不再触发；
//   - 连续 missLimit 个周期没有任何入站字节（浏览器已死或链路被静默丢弃）
//     → 主动 destroy 连接：浏览器拿到 close 后 dsh-client-connection 会
//     按指数退避自动重连，实时通道随即恢复。
// 只 Ping 浏览器侧：上游是本机 loopback，不会过期；浏览器回的 Pong 原样
// 透传给上游 ws 服务（未请求的 Pong 对 ws 库无害，只触发无害的 pong 事件）。
const WS_PING_FRAME = Buffer.from([0x89, 0x00]); // FIN + opcode 9、长度 0、不掩码

/**
 * 在透传的浏览器侧 socket 上挂载心跳：定期 Ping 保活 + 静默断链检测。
 * 任一路由方向只要有字节流动（Pong 响应）就把静默计数归零；连续 missLimit
 * 个周期零入站流量则判定链路已死，销毁 socket 触发浏览器端重连。
 * @param {import('node:net').Socket} socket 浏览器侧的透传 socket
 * @param {{intervalMs?:number, missLimit?:number}} [opts] 心跳周期与容忍的静默周期数
 */
function attachWebSocketHeartbeat(socket, { intervalMs = 30_000, missLimit = 2 } = {}) {
  let misses = 0;
  let stopped = false;
  const onInbound = () => { misses = 0; };
  const timer = setInterval(() => {
    if (stopped) return;
    misses += 1;
    if (misses >= missLimit) {
      // 连续多个周期没有任何入站流量（连 Pong 都没有）→ 静默断链，断开让客户端重连
      socket.destroy();
      return;
    }
    // write 到已销毁的 socket 会抛错（destroy 竞态），写前检查并兜底
    if (!socket.destroyed) {
      try { socket.write(WS_PING_FRAME); } catch { /* 忽略 */ }
    }
  }, intervalMs);
  timer.unref?.();
  socket.on('data', onInbound);
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    socket.off('data', onInbound);
    socket.off('close', cleanup);
    socket.off('error', cleanup);
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
}

/** 读取（并丢弃）请求体的便捷封装（setup/save 解析前限流用不到流语义）。 */
function readBody(req, maxBytes) {
  return new Promise((resolve) => {
    let body = '';
    let over = false;
    req.on('data', (c) => {
      if (over) return;
      body += c;
      if (body.length > maxBytes) {
        over = true;
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => { if (!over) resolve(body); });
    req.on('error', () => resolve(null));
  });
}

/**
 * 启动 dsh-pocket 代理。
 * @param {object} opts
 * @param {number} [opts.port]      监听端口（默认 3081；dsh web 保持 3080）
 * @param {string} [opts.host]      监听地址（默认 0.0.0.0：局域网与隧道都能到）
 * @param {{host:string,port:number}} [opts.upstream] 上游 dsh web（默认 127.0.0.1:3080）
 * @param {string} [opts.injectHtml] 注入 HTML 的内容（默认 polyfill + 移动端适配；传 '' 关闭）
 * @param {object} [opts.auth]       OAuth（Gitee / GitHub）认证配置：
 *   - sessionKey: string | (() => string) —— 进程级会话密钥（函数形式支持轮换＝登出所有设备）
 *   - getConfig(): OAuth 配置（每次请求实时读；见 lib/oauth.mjs readOAuthConfig，含 provider）
 *   - saveConfig?(draft): setup 页保存凭据（可注入测试桩）
 *   - bindUser?(user): 绑定账号落盘（user 含 { id, login, provider }；可注入测试桩）
 *   - giteeBase?/githubBase?/githubApiBase?/fetchImpl?/stateTtlMs?: 测试注入
 * @param {object|false} [opts.heartbeat] WebSocket 心跳注入（PR #41）：{ intervalMs, missLimit }；false 关闭（默认开：30s/容忍 2 个静默周期）
 * @returns {Promise<{server:import('node:http').Server, close:()=>Promise<void>}>}
 */
export function createPocketProxy({
  port = 3081, host = '0.0.0.0', upstream = DEFAULT_UPSTREAM, log = null, injectHtml = DEFAULT_INJECT, auth = null,
  heartbeat = {}, launchToken = () => '', handshakeLimit,
} = {}) {
  // 会话握手重试计数（issue #91）：Safari 在 http://IP 源上丢 3xx 的 cookie → 死循环
  const handshake = createHandshakeTracker(
    typeof handshakeLimit === 'number' ? { max: handshakeLimit } : {},
  );

  const resolveSessionKey = () => (typeof auth?.sessionKey === 'function' ? auth.sessionKey() : auth?.sessionKey) ?? null;
  const states = auth ? createStateStore(typeof auth.stateTtlMs === 'number' ? { ttlMs: auth.stateTtlMs } : {}) : null;
  /** 会话 cookie 附加属性：只有 https 入口才加 Secure。
 *  loopback/局域网的 http 入口若也加 Secure，浏览器会直接丢弃该 cookie（存不下 → 登录失效）。 */
function sessionCookieAttrs(origin) {
  return String(origin ?? '').toLowerCase().startsWith('https://') ? '; Secure' : '';
}

/** setup 表单 nonce（进程级随机）：配合 isSameSiteRequest 拦跨站伪造提交。 */
  const setupNonce = randomBytes(16).toString('hex');
  const fetchImpl = auth?.fetchImpl ?? fetch;

  /**
   * 每个 provider 的端点基址解析（测试注入优先，缺省用 provider 表里的线上地址）。
   * giteeBase 是既有注入名（E2E 在用）；GitHub 的 API 异域，故单独一个 githubApiBase。
   * @returns {{base:string, apiBase?:string}}
   */
  function providerBases(provider) {
    const p = providerInfo(provider);
    if (p.id === 'github') {
      return { base: auth?.githubBase ?? p.base, apiBase: auth?.githubApiBase ?? p.apiBase ?? undefined };
    }
    return { base: auth?.giteeBase ?? p.base };
  }

  let listeningPort = port;

  /** 会话 cookie 校验：值必须等于 sha256(boundUid:sessionKey)。 */
  function sessionOk(req, cfg) {
    const uid = cfg?.boundUid;
    const sk = resolveSessionKey();
    if (!uid || !sk) return false;
    const v = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!v) return false;
    return safeEqual(v, sessionCookieValue(uid, sk));
  }

  const sendHtml = (res, status, html, extraHeaders = {}) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
    res.end(html);
  };
  const sendJson = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  /**
   * OAuth / 初始化路由（在认证门之前处理）。返回 true 表示已处理。
   * /pocket-setup 与 bind 用途的 start 仅 loopback 可用。
   */
  async function handleOAuthRoute(req, res, pathname, loopback) {
    const cfgNow = () => (typeof auth?.getConfig === 'function' ? auth.getConfig() : null) ?? null;
    const setupUrl = () => `http://127.0.0.1:${listeningPort || 3081}/pocket-setup`;
    /** setup 页渲染（示例地址用真实监听端口；带进程级 nonce）。 */
    const setupHtml = (cfg, err) => setupPageHtml(cfg, err, listeningPort || 3081, setupNonce);

    if (pathname === '/pocket-oauth/start') {
      // 来源校验先于一切：跨站页面不得代办登录/绑定（发起登录本身也会写 state 并跳鉴权方）
      if (!isSameSiteRequest(req)) {
        sendHtml(res, 403, untrustedOriginPageHtml());
        return true;
      }
      // bind 是 setup 专属动作：本机限定检查先于配置检查（未配置时也明确告知「仅限本机」）
      const purpose = new URL(req.url ?? '/', 'http://dsh.invalid').searchParams.get('bind') === '1' ? 'bind' : 'login';
      if (purpose === 'bind' && !loopback) {
        sendHtml(res, 403, pageHtml('DSH Pocket · 仅限本机', `
<h1>🔒 DSH Pocket</h1>
<p>绑定账号是初始化操作，只能在本机（127.0.0.1）进行。<br>Binding may only be initiated from this machine (loopback).</p>`));
        return true;
      }
      const cfg = cfgNow();
      if (!cfg?.clientId || !cfg?.clientSecret) {
        sendHtml(res, 503, unconfiguredPageHtml(setupUrl()));
        return true;
      }
      const provider = normalizeProvider(cfg.provider);
      const hostHeader = String(req.headers.host ?? '').trim().toLowerCase();
      const origin = (cfg.callbackOrigins ?? []).find((o) => {
        try { return new URL(o).host.toLowerCase() === hostHeader; } catch { return false; }
      });
      if (!origin) {
        sendHtml(res, 403, originNotAllowedPageHtml(cfg.callbackOrigins, provider));
        return true;
      }
      if (purpose === 'login' && !cfg.boundUid) {
        sendHtml(res, 503, unboundPageHtml(setupUrl(), provider));
        return true;
      }
      const state = states.create(purpose, provider);
      res.writeHead(302, {
        location: providerAuthorizeUrl({
          provider, clientId: cfg.clientId, redirectUri: `${origin}${OAUTH_CALLBACK_PATH}`, state, ...providerBases(provider),
        }),
        'cache-control': 'no-store',
      });
      res.end();
      return true;
    }

    if (pathname === OAUTH_CALLBACK_PATH) {
      const u = new URL(req.url ?? '/', 'http://dsh.invalid');
      const errParam = u.searchParams.get('error');
      if (errParam) {
        const errDetail = `${errParam}${u.searchParams.get('error_description') ? `: ${u.searchParams.get('error_description')}` : ''}`;
        sendHtml(res, 403, oauthDeniedPageHtml(errDetail, cfgNow()?.provider));
        return true;
      }
      const code = u.searchParams.get('code');
      // state 单次使用，且**由 state 决定用哪家换票**——不信任任何客户端可控参数
      // （否则可以把 github 的 code 拿去 gitee 端点换，或反过来绕开跨家撞号比对）。
      const rec = states.consume(u.searchParams.get('state'));
      if (!code || !rec) {
        sendHtml(res, 400, stateInvalidPageHtml());
        return true;
      }
      const { purpose, provider } = rec;
      if (purpose === 'bind' && !loopback) {
        sendHtml(res, 403, pageHtml('DSH Pocket · 仅限本机', `<h1>🔒 DSH Pocket</h1><p>绑定回调只能在本机完成。</p>`));
        return true;
      }
      const cfg = cfgNow();
      if (!cfg?.clientId || !cfg?.clientSecret) {
        sendHtml(res, 503, unconfiguredPageHtml(setupUrl()));
        return true;
      }
      // redirect_uri 必须与 authorize 时一致：取当前 Host 对应的白名单 origin
      const hostHeader = String(req.headers.host ?? '').trim().toLowerCase();
      const origin = (cfg.callbackOrigins ?? []).find((o) => {
        try { return new URL(o).host.toLowerCase() === hostHeader; } catch { return false; }
      });
      if (!origin) {
        sendHtml(res, 403, originNotAllowedPageHtml(cfg.callbackOrigins, provider));
        return true;
      }
      let user;
      try {
        user = await exchangeCodeForUser({
          provider, clientId: cfg.clientId, clientSecret: cfg.clientSecret, code,
          redirectUri: `${origin}${OAUTH_CALLBACK_PATH}`, fetchImpl, ...providerBases(provider),
        });
      } catch (err) {
        log?.(`dsh-pocket: oauth exchange failed | OAuth 换票失败: ${err?.message ?? err}`);
        sendHtml(res, 502, oauthErrorPageHtml(err?.message ?? String(err), provider));
        return true;
      }
      if (purpose === 'bind') {
        try {
          // provider 一并落盘：登录时会话比对要「先比 provider 再比 uid」
          await auth.bindUser?.({ ...user, provider });
        } catch (err) {
          log?.(`dsh-pocket: bind failed | 绑定失败: ${err?.message ?? err}`);
          sendHtml(res, 500, oauthErrorPageHtml(err?.message ?? String(err), provider));
          return true;
        }
        sendHtml(res, 200, bindSuccessPageHtml(user.login, provider));
        return true;
      }
      // 先比 provider 再比 uid：堵死跨家撞号（gitee uid 4242 ≠ github uid 4242）
      if (provider !== normalizeProvider(cfg.provider) || String(user.id) !== String(cfg.boundUid)) {
        log?.(`dsh-pocket: account mismatch (${provider}/${user.login}) | 账号不匹配`);
        sendHtml(res, 403, oauthMismatchPageHtml(user.login, provider));
        return true;
      }
      // 登录成功：种会话 cookie（HttpOnly；绑定进程级 sessionKey；https 入口加 Secure）
      res.writeHead(303, {
        location: '/',
        'set-cookie': `${SESSION_COOKIE}=${sessionCookieValue(cfg.boundUid, resolveSessionKey())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${sessionCookieAttrs(origin)}`,
        'cache-control': 'no-store',
      });
      res.end();
      return true;
    }

    if (pathname === '/pocket-oauth/logout') {
      // 跨站强制登出也是拒绝服务，同样按来源校验拦掉（地址栏直接打开 = Sec-Fetch-Site: none，仍可用）
      if (!isSameSiteRequest(req)) {
        sendHtml(res, 403, untrustedOriginPageHtml());
        return true;
      }
      // 清除 cookie 时按当前 Host 对应的白名单 origin 决定是否带 Secure（与种下时保持一致）
      const logoutCfg = cfgNow();
      const logoutOrigin = (logoutCfg?.callbackOrigins ?? []).find((o) => {
        try { return new URL(o).host.toLowerCase() === String(req.headers.host ?? '').trim().toLowerCase(); } catch { return false; }
      });
      res.writeHead(302, {
        location: '/',
        'set-cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${sessionCookieAttrs(logoutOrigin)}`,
        'cache-control': 'no-store',
      });
      res.end();
      return true;
    }

    if (pathname === '/pocket-setup') {
      if (!loopback) {
        sendHtml(res, 403, pageHtml('DSH Pocket · 仅限本机', `
<h1>🔒 DSH Pocket</h1>
<p>初始化页面只能在本机（127.0.0.1）打开。<br>The setup page is loopback-only.</p>`));
        return true;
      }
      sendHtml(res, 200, setupHtml(cfgNow()));
      return true;
    }

    if (pathname === '/pocket-setup/save') {
      if (!loopback) {
        sendHtml(res, 403, pageHtml('DSH Pocket · 仅限本机', `<h1>🔒 DSH Pocket</h1><p>初始化操作只能在本机进行。</p>`));
        return true;
      }
      // 跨站页面能在受害者浏览器里伪造本机 POST（Host 与源地址都「像」本机）→ 必须校验来源
      if (!isSameSiteRequest(req)) {
        sendHtml(res, 403, untrustedOriginPageHtml());
        return true;
      }
      if (req.method !== 'POST') {
        sendHtml(res, 405, setupHtml(cfgNow(), '请用 POST 提交表单 | use POST'));
        return true;
      }
      const body = await readBody(req, 16 * 1024);
      if (body == null) {
        sendHtml(res, 413, setupHtml(cfgNow(), '表单过大 | form too large'));
        return true;
      }
      const form = new URLSearchParams(body);
      // 表单 nonce：跨站页面读不到初始化页的 HTML（同源策略），因此无法伪造通过校验的提交
      if (!safeEqual(String(form.get('nonce') ?? ''), setupNonce)) {
        sendHtml(res, 403, setupHtml(cfgNow(), '表单已失效，请刷新初始化页面后重试 | stale form — reload the setup page'));
        return true;
      }
      const clientId = String(form.get('client_id') ?? '').trim();
      const secretInput = String(form.get('client_secret') ?? '').trim();
      const prev = cfgNow();
      const clientSecret = secretInput || prev?.clientSecret || '';
      // provider 单选：显式给了就校验（只认 gitee/github，非法值拒绝）；没给则沿用已存的
      const providerInput = String(form.get('provider') ?? '').trim();
      if (providerInput && providerInput !== 'gitee' && providerInput !== 'github') {
        sendHtml(res, 400, setupHtml({ ...prev, clientId }, `未知的鉴权方：${providerInput} | unknown provider: ${providerInput}`));
        return true;
      }
      const provider = providerInput || normalizeProvider(prev?.provider);
      const originsResult = parseOrigins(String(form.get('origins') ?? ''));
      if (!clientId || !clientSecret) {
        sendHtml(res, 400, setupHtml({ ...prev, clientId, provider }, 'Client ID / Secret 不能为空 | Client ID / Secret required'));
        return true;
      }
      if (originsResult.error) {
        sendHtml(res, 400, setupHtml({ ...prev, clientId, provider }, originsResult.error));
        return true;
      }
      try {
        await auth.saveConfig?.({
          provider,
          clientId,
          clientSecret,
          callbackOrigins: originsResult.origins,
          boundUid: null, // 改配置后必须重新绑定（一次点击，见 bind 流程）
          boundLogin: null,
        });
      } catch (err) {
        log?.(`dsh-pocket: setup save failed | 保存失败: ${err?.message ?? err}`);
        sendHtml(res, 500, setupHtml({ ...prev, clientId, provider }, err?.message ?? String(err)));
        return true;
      }
      // 保存成功 → 直接发起绑定（bind 用途的 state 仅 loopback 可建，本路由本就 loopback）
      res.writeHead(303, { location: '/pocket-oauth/start?bind=1', 'cache-control': 'no-store' });
      res.end();
      return true;
    }

    return false;
  }

  const server = createServer((req, res) => {
    // 策略判定一律用 policyHost（issue #90）：Host 头可伪造，用不可伪造的 TCP 源地址
    // 给它设下限。转发给上游的 Host 由 loopbackAuthority 单独改写，不受这里影响。
    const host = policyHost(req, String(req.headers.host ?? ''));
    const loopback = isLoopbackHost(host);
    let pathname = String(req.url ?? '/');
    try { pathname = new URL(req.url ?? '/', 'http://dsh.invalid').pathname; } catch { /* 用原值兜底 */ }

    // ---- OAuth / 初始化路由（认证之前） ----
    if (pathname === '/pocket-oauth/start' || pathname === OAUTH_CALLBACK_PATH
      || pathname === '/pocket-oauth/logout' || pathname === '/pocket-setup' || pathname === '/pocket-setup/save') {
      handleOAuthRoute(req, res, pathname, loopback).catch((err) => {
        log?.(`dsh-pocket: oauth route failed | OAuth 路由失败: ${err?.message ?? err}`);
        if (!res.headersSent) sendHtml(res, 500, oauthErrorPageHtml(err?.message ?? String(err)));
        else res.destroy();
      });
      return;
    }

    // ---- 认证门：loopback 免认证，其余一律要会话（fail closed：未配置/未绑定即全拒） ----
    if (auth && !loopback) {
      const cfg = (typeof auth.getConfig === 'function' ? auth.getConfig() : null) ?? null;
      if (!sessionOk(req, cfg)) {
        const provider = normalizeProvider(cfg?.provider);
        if (!cfg?.clientId || !cfg?.clientSecret) {
          if (isHtmlRequest(req)) sendHtml(res, 503, unconfiguredPageHtml(`http://127.0.0.1:${listeningPort || 3081}/pocket-setup`));
          else sendJson(res, 503, { error: 'oauth-not-configured' });
        } else if (!cfg.boundUid) {
          if (isHtmlRequest(req)) sendHtml(res, 503, unboundPageHtml(`http://127.0.0.1:${listeningPort || 3081}/pocket-setup`, provider));
          else sendJson(res, 503, { error: 'oauth-not-bound' });
        } else if (isHtmlRequest(req)) {
          sendHtml(res, 200, oauthLoginPageHtml(provider));
        } else {
          sendJson(res, 401, { error: 'unauthorized' });
        }
        return;
      }
    }
    const headers = loopbackAuthority({ ...req.headers }, upstream);
    // dsh web 浏览器会话 token（issue #77）：首屏根路径补一次，换回绑定 authority 的 cookie
    const launchTok = (typeof launchToken === 'function' ? launchToken() : '') || '';
    // 先清掉历史遗留的 dsh-desktop-* 参数（issue #75），再补 launch token
    // 握手重试上限（issue #91）：Safari 不保存 http://IP 源上 3xx 下发的 cookie →
    // 补 token → 上游 303 → 浏览器仍无 cookie → 无限循环。达到上限就别再补了，
    // 让请求落到提示页，而不是继续转圈。
    const handshakeIp = String(req.socket?.remoteAddress ?? 'unknown');
    // `/?dsh-pocket-retry=1`：提示页上的「重试」入口——清掉这一轮的失败计数，让握手
    // 重新走一遍（否则用户得干等窗口过期）。这参数是我们自己加的，不往上游透传。
    let cleanPath = stripDesktopMarkers(req.url);
    if (cleanPath.includes(HANDSHAKE_RETRY_PARAM)) {
      handshake.clear(handshakeIp);
      cleanPath = stripQueryParam(cleanPath, HANDSHAKE_RETRY_PARAM);
    }
    const handshakeOver = launchTok !== '' && handshake.exhausted(handshakeIp);
    const upstreamPath = handshakeOver
      ? cleanPath
      : upstreamPathWithLaunchToken(cleanPath, req.method, req.headers.cookie, launchTok);
    const didInjectToken = upstreamPath !== cleanPath;
    if (didInjectToken) {
      handshake.record(handshakeIp);
      handshake.prune();
    }
    // 请求带上了会话 cookie → 这一轮的握手计数可以清掉了（说明 cookie 通路是好的）
    if (!didInjectToken && String(req.headers.cookie ?? '').includes(DSH_AUTH_COOKIE)) {
      handshake.clear(handshakeIp);
    }
    if (handshakeOver && isHtmlRequest(req)) {
      // 已判定握不上手 → 停在这里给人话，别再转圈。API/WS 不走这里（上游会 401）。
      res.writeHead(503, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-dsh-pocket-handshake': 'blocked',
      });
      res.end(handshakeBlockedPageHtml());
      return;
    }
    const proxyReq = httpRequest(
      { host: upstream.host, port: upstream.port, method: req.method, path: upstreamPath, headers, agent: false },
      (proxyRes) => {
        log?.(`${req.method} ${req.url} -> ${proxyRes.statusCode}`);
        const contentType = String(proxyRes.headers['content-type'] ?? '');
        // issue #91：我们刚注入了 launch token，上游回 303（换 cookie 后回干净根路径）。
        // Safari 不保存 http://IP 源上 3xx 响应下发的 cookie，于是浏览器下次仍无 cookie
        // → 代理再注入 → 再 303 → 死循环。这里把这次 303 改成 200 过渡页：Set-Cookie
        // 照发（200 上的 cookie 不会被那条重定向策略丢掉），页面用 meta refresh 跳回 `/`。
        if (didInjectToken && proxyRes.statusCode === 303 && isHtmlRequest(req)) {
          const out = { ...proxyRes.headers };
          delete out['content-length'];
          delete out['transfer-encoding'];
          delete out.location; // 自己跳，不留给浏览器去重做一次 303
          const page = Buffer.from(handshakePageHtml(), 'utf8');
          out['content-type'] = 'text/html; charset=utf-8';
          out['content-length'] = String(page.length);
          out['cache-control'] = 'no-store';
          out['x-dsh-pocket-handshake'] = 'transition';
          proxyRes.resume(); // 消费掉上游响应体，释放连接
          res.writeHead(200, out);
          res.end(page);
          return;
        }
        // issue #81：上游 desktop-browser-access 门禁（DSH Desktop 未开启「浏览器访问」时）
        // 对普通浏览器（含经本代理转发的手机）返回 403 text/plain "forbidden"，且本代理无法
        // 携带 Electron renderer secret 绕过。对符合该特征的**浏览器导航**请求改写为可操作
        // 提示页；API/WS 与其余 403 原样透传（不猜 secret、不把任意 403 都判为桌面门禁）。
        if (proxyRes.statusCode === 403 && contentType.includes('text/plain')) {
          const navReq = isHtmlRequest(req);
          const gateChunks = [];
          let gateOverflow = false;
          const passRaw403 = () => {
            if (res.headersSent) return;
            res.writeHead(403, { ...proxyRes.headers });
            if (gateChunks.length) res.write(Buffer.concat(gateChunks));
            proxyRes.pipe(res);
          };
          proxyRes.on('data', (c) => {
            if (gateOverflow) return;
            gateChunks.push(c);
            if (Buffer.concat(gateChunks).length > 65536) { gateOverflow = true; gateChunks.length = 0; passRaw403(); }
          });
          proxyRes.on('end', () => {
            if (gateOverflow || res.headersSent) return;
            const body = Buffer.concat(gateChunks).toString('utf8').trim();
            if (navReq && body === 'forbidden') {
              res.writeHead(403, {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
                'x-dsh-pocket-gate': 'desktop-browser-access',
              });
              res.end(desktopAccessBlockedPageHtml());
            } else {
              res.writeHead(403, { ...proxyRes.headers });
              res.end(Buffer.concat(gateChunks));
            }
          });
          proxyRes.on('error', () => res.destroy());
          return;
        }
        // 只给**未压缩**的 HTML 文档注入（SSE/WS/JS/CSS 原样透传；压缩流注入会损坏页面）；
        // 注入后修正 Content-Length
        if (injectHtml && contentType.includes('text/html') && !isCompressed(proxyRes.headers)) {
          const chunks = [];
          proxyRes.on('data', (c) => chunks.push(c));
          proxyRes.on('end', () => {
            let html = Buffer.concat(chunks).toString('utf8');
            if (!html.includes(INJECT_MARK)) {
              html = html.replace(/<head[^>]*>/i, (m) => `${m}${injectHtml}`);
            }
            const out = Buffer.from(html, 'utf8');
            const outHeaders = { ...proxyRes.headers };
            delete outHeaders['content-length'];
            delete outHeaders['transfer-encoding'];
            outHeaders['content-length'] = String(out.length);
            // 注入后的 HTML 携带本代理的动态补丁（含注入标记判重），
            // 必须禁用缓存——否则手机/中间层（nginx 等）拿到没有补丁的旧
            // 文档后，isLoopback 修复不生效且难以排查（表现为"改了没效果"）。
            outHeaders['cache-control'] = 'no-store';
            delete outHeaders['etag'];
            delete outHeaders['last-modified'];
            delete outHeaders['expires'];
            res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
            res.end(out);
          });
          proxyRes.on('error', () => res.destroy());
          return;
        }
        // 大 JSON/text 响应**流式压缩**（issue #12）：长会话历史一次返回 17MB+，
        // 局域网直连与隧道段都吃满带宽；压缩到 ~1MB。跳过已压缩、SSE 流
        // （/api/events.* 原样透传）、HTML（走上面的注入分支）。
        // brotli 质量选 6（issue #25）：zlib 默认 q11 压 17MB 要 40s+，手机直接超时；
        // q6 实测 128ms（比 gzip 的 88ms 略慢但同档）且输出更小（1.00MB vs 1.20MB）。
        const acceptEncoding = String(req.headers['accept-encoding'] ?? '');
        const canGzip = /\bgzip\b/.test(acceptEncoding);
        const canBr = /\bbr\b/.test(acceptEncoding);
        const isEventStream = contentType.includes('text/event-stream');
        const knownLen = Number(proxyRes.headers['content-length'] || 0);
        const shouldCompress = (canGzip || canBr)
          && !isCompressed(proxyRes.headers)
          && !isEventStream
          && (contentType.includes('application/json') || contentType.startsWith('text/'))
          && (knownLen === 0 || knownLen >= 1024);
        if (shouldCompress) {
          const enc = canBr ? 'br' : 'gzip';
          const outHeaders = { ...proxyRes.headers };
          delete outHeaders['content-length'];
          delete outHeaders['transfer-encoding'];
          outHeaders['content-encoding'] = enc;
          res.writeHead(proxyRes.statusCode ?? 200, outHeaders);
          const z = enc === 'br'
            ? createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 6 } })
            : createGzip();
          proxyRes.pipe(z).pipe(res);
          // 任一端断开都要清理（含压缩流）。注意：不能用 proxyRes 的 'close'
          // 来掐 res——正常结束后 close 也会触发，此时压缩流可能还没写完，
          // 会误杀连接；异常中止用 'aborted'。
          res.on('close', () => { proxyRes.destroy(); z.destroy(); });
          proxyRes.on('error', () => { z.destroy(); res.destroy(); });
          proxyRes.on('aborted', () => { z.destroy(); res.destroy(); });
          z.on('error', () => res.destroy());
          return;
        }
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
        // 任一端断开都要清理另一端：客户端断连销毁上游流（不留僵尸），
        // 上游流中途断开也要掐断客户端（否则响应头已发、体没发完 → 悬挂）
        res.on('close', () => proxyRes.destroy());
        proxyRes.on('error', () => res.destroy());
        proxyRes.on('close', () => { if (!res.writableEnded) res.destroy(); });
      },
    );
    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`dsh-pocket: 无法连接上游 dsh web（${upstream.host}:${upstream.port}）——先启动 dsh web | ${err.message}`);
    });
    req.pipe(proxyReq);
  });

  // WebSocket upgrade（DSH 的 /api/events.mux + events.host 流式通道）原样透传
  server.on('upgrade', (req, socket, head) => {
    // 与 HTTP 侧同一套判定（issue #90）：否则伪造 Host 的 WS 握手仍可绕过认证
    const host = policyHost(req, String(req.headers.host ?? ''));
    const loopback = isLoopbackHost(host);
    // WS 同样校验会话 cookie（防止绕过 HTTP 认证从 WS 进入）
    if (auth && !loopback) {
      const cfg = (typeof auth.getConfig === 'function' ? auth.getConfig() : null) ?? null;
      if (!sessionOk(req, cfg)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    }
    const headers = loopbackAuthority({ ...req.headers }, upstream);
    const proxyReq = httpRequest({
      // 同样清掉历史遗留的 dsh-desktop-* 参数（issue #75）
      host: upstream.host, port: upstream.port, method: req.method, path: stripDesktopMarkers(req.url), headers, agent: false,
    });
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write('HTTP/1.1 101 Switching Protocols\r\n');
      // 原样回传上游的 upgrade 头（Sec-WebSocket-Accept 等）
      const raw = [];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        raw.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
      }
      socket.write(`${raw.join('\r\n')}\r\n\r\n`);
      if (proxyHead?.length) socket.write(proxyHead);
      // pipe 必须 end:false：默认 end:true 会在对端 FIN 时抢先 end() 对端 socket
      // （优雅 FIN），此时 teardown 的 destroy() 已无法强制关闭对方——上游只收
      // 到 FIN 进入 half-open 永不关闭（PR #56）。半关闭统一交给下面的 'end'
      // 监听 → teardown destroy（RST 强制关闭双方）。
      socket.pipe(proxySocket, { end: false });
      proxySocket.pipe(socket, { end: false });
      // 心跳注入（PR #41）：保活 + 静默断链检测（见 attachWebSocketHeartbeat）
      if (heartbeat !== false) attachWebSocketHeartbeat(socket, heartbeat ?? {});
      // 任一端断开都要清理另一端（避免上游残留僵尸连接占用 dsh 连接槽）。
      // 上游侧必须 resetAndDestroy（发 RST）：destroy() 只发干净 FIN，而上游
      // http server 默认 allowHalfOpen=true，收到 FIN 不自动关闭 → 上游仍悬挂
      // （PR #56 实测）。RST 强制对端立即关闭。
      const teardown = () => {
        try { proxySocket.resetAndDestroy?.() ?? proxySocket.destroy(); } catch { try { proxySocket.destroy(); } catch {} }
        try { socket.destroy(); } catch {}
      };
      // 上游侧透传 socket 的读错误（如 dsh web 重启/断开时的 ECONNRESET）必须
      // 吞掉并清理对端，否则未处理的 'error' 事件会让整个 dsh web 进程崩溃退出。
      proxySocket.on('error', () => { try { socket.destroy(); } catch {} });
      proxySocket.on('close', teardown);
      socket.on('close', teardown);
      // 半关闭（收到对端 FIN 的 'end'）对双向转发同样意味着这一端要走了：http server
      // 默认 allowHalfOpen=true，收到 FIN 只触发 'end' 不自动关——若不在 'end' 时销毁，
      // 浏览器/App 直接关页（不发 WS close 帧就 FIN）留下的连接会永久挂在 half-open
      // 状态，上游连接槽被占（且 server.close() 永远等不完）。双向流里半关闭无意义。
      socket.on('end', teardown);
      proxySocket.on('end', teardown);
    });
    // 上游返回普通 HTTP 响应（非 101）：把状态码/头回写后断开，别让客户端永久挂起
    proxyReq.on('response', (proxyRes) => {
      if (proxyRes.statusCode === 101) return; // 理论上 101 走 upgrade 事件
      try {
        const raw = [`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage ?? ''}`.trim()];
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          raw.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
        }
        // end 会 flush 响应头再 FIN——不要紧跟 destroy()，否则排队的头会被丢弃
        socket.end(raw.join('\r\n') + '\r\n\r\n');
        proxyRes.resume(); // 消费上游响应体，释放连接
      } catch { socket.destroy(); }
    });
    proxyReq.on('error', () => socket.destroy());
    // 关键：浏览器在握手请求后可能立即发出首帧（如 mux 流的初始 RPC），
    // node 把它放在 upgrade 事件的 head 里。必须先于 end() 写入 proxyReq，
    // 让上游在 upgrade 事件里就拿到它（与直连行为一致）；等 101 之后再写
    // 会变成迟到的 socket 数据，DSH 的 mux 协议可能错过这个窗口。
    if (head?.length) proxyReq.write(head);
    proxyReq.end();
    socket.on('error', () => socket.destroy());
  });

  // 跟踪所有 TCP 连接（含 WebSocket upgrade 后的 socket——Node 的
  // closeAllConnections 不包含它们，不手动销毁 close() 会永远等）
  const clientSockets = new Set();
  server.on('connection', (sock) => {
    clientSockets.add(sock);
    sock.on('close', () => clientSockets.delete(sock));
    sock.on('error', () => {}); // 防未处理 error 崩进程
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      listeningPort = actualPort;
      resolve({
        server,
        port: actualPort,
        close: () => new Promise((r) => {
          for (const s of clientSockets) { try { s.destroy(); } catch { /* 忽略 */ } }
          server.close(() => r());
        }),
      });
    });
  });
}
