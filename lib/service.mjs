// dsh-pocket 服务：在 dsh web 进程内跑改头代理
//
// - 代理：监听 0.0.0.0:<port>（默认 3081），把入站 Host/Origin 改写成
//   127.0.0.1:<dshPort>（dsh web 实际端口），HTTP + WebSocket 全透传。
//   这样 DSH 的 /api 浏览器信任栅栏永远看到 loopback，任意来源都能进，
//   且不需要改 dsh 的任何配置（0.0.0.0 绑定被 dsh 官方禁用）。
// - 访问控制：Gitee OAuth（lib/oauth.mjs + lib/proxy.mjs）；公网入口由用户
//   自建隧道（固定域名）指向本代理端口，插件不再管隧道。

import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { createPocketProxy, classifyHost } from './proxy.mjs';
import { oauthView } from './oauth.mjs';

const require = createRequire(import.meta.url);

/** URL → 二维码 data URL（浏览器 <img> 直接显示，全本地不依赖第三方）。 */
export async function qrDataUrl(text, { width = 220, margin = 1 } = {}) {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin, width, type: 'image/png' });
}

// RFC1918 私网地址：手机与电脑连同一局域网时通常可直连。
// 另含 CGNAT 100.64/10（RFC 6598，Tailscale/ZeroTier 默认网段，公网不可路由），保持一致（issue #79）。
const PRIVATE_IPV4_RE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/;

/** 名称像真实物理网卡的接口（WLAN / Wi-Fi / Ethernet / 以太网 / 有线 / 无线 / en / eth）。 */
const PHYSICAL_IFACE_RE = /^(?:wlan|wi-?fi|wireless|ethernet|eth\d|en\d|wlp\d|以太网|有线|无线|本地连接)/i;

/** 常见的 VPN / 虚拟网卡名称：手机通常无法通过它们直连电脑。 */
const VPN_IFACE_RE = /(?:radmin|tailscale|zerotier|easytier|et_|tun|tap|vpn|vethernet|virtual|vmware|virtualbox|wsl|docker|teredo|hamachi|bluetooth|bridge)/i;

/**
 * 从 networkInterfaces() 返回的接口表里选出手机最可能可达的 IPv4。
 *
 * `os.networkInterfaces()` 的枚举顺序不可靠：Windows 上 Radmin VPN / Tailscale /
 * vEthernet 等虚拟网卡常排在 WLAN 前面，旧实现直接取第一张非回环网卡，会生成
 * 手机打不开的二维码。这里按以下规则打分排序：
 *   - RFC1918 私网地址优先（10/8、172.16/12、192.168/16）；
 *   - 名称像物理网卡再加分；
 *   - 名称像 VPN/虚拟网卡减分；
 *   - 同分保持原枚举顺序。
 * 没有任何私网地址时回退到最高分地址（例如纯 VPN 环境仍可用）。
 *
 * @param {ReturnType<typeof networkInterfaces>} interfaces
 * @returns {string|null}
 */
export function selectLanIPv4(interfaces) {
  const candidates = [];
  for (const [name, addrs] of Object.entries(interfaces ?? {})) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      // 排除 loopback 与 link-local；其余地址即使不是私网（如 Radmin 的 26.x）也保留兜底
      if (!ip || ip.startsWith('127.') || ip.startsWith('169.254.')) continue;

      let score = 0;
      if (PRIVATE_IPV4_RE.test(ip)) score += 100;
      if (PHYSICAL_IFACE_RE.test(name)) score += 20;
      else if (VPN_IFACE_RE.test(name)) score -= 50;

      candidates.push({ ip, score, order: candidates.length });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.order - b.order);
  return candidates[0]?.ip ?? null;
}

// ---------- WSL 局域网 IP（issue #39） ----------
// WSL2 是 NAT 模式：WSL 内部 os.networkInterfaces() 只能看到自己的虚拟网卡
// （172.x.x.x），看不到 Windows 宿主机的物理网卡 IP（192.168.x.x）——手机在
// 同一 WiFi 下访问的是 Windows 宿主机，拿 WSL 的 IP 生成的二维码必然打不开。
// 解法：检测到 WSL 时，通过 WSL interop 直接执行 Windows 的 ipconfig.exe，
// 解析出 Windows 侧非虚拟网卡的 IPv4 作为局域网地址；失败回退本机探测。

/** WSL 检测：/proc/version 含 microsoft/wsl，或 WSL 专属环境变量存在。 */
export function detectWsl() {
  try {
    const v = readFileSync('/proc/version', 'utf8').toLowerCase();
    if (v.includes('microsoft') || v.includes('wsl')) return true;
  } catch { /* 非 Linux：无 /proc/version */ }
  // 注意：**不能**用 WSLENV 判据——Windows Terminal 在原生 Windows 上也会设置
  // WSLENV（如 WT_SESSION:WT_PROFILE_ID:），会误判成 WSL。只认 WSL 内部才有的变量。
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

/**
 * 解析 ipconfig.exe 输出，默认取非虚拟网卡块的 IPv4 地址（保持输出顺序）。
 * 支持中文（`IPv4 地址 . . . :`）与英文（`IPv4 Address. . . :`）两种格式。
 * @param {string} text ipconfig.exe 的完整输出
 * @param {{ includeVpn?: boolean }} [opts] 传 includeVpn 时保留 Tailscale/VPN 等候选
 * @returns {string[]} 候选 IPv4 列表
 */
export function parseIpconfig(text, { includeVpn = false } = {}) {
  const out = [];
  // 网卡块：块标题行顶格（行首无缩进），其后内容行带缩进
  const blocks = String(text).split(/\r?\n(?=\S)/);
  const ipRe = /IPv4[^0-9]{0,40}((?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)/;
  for (const block of blocks) {
    const title = String(block.split(/\r?\n/)[0] ?? '');
    // 跳过虚拟网卡块（vEthernet (WSL)、Docker、VirtualBox、VPN 等）
    if (!includeVpn && VPN_IFACE_RE.test(title)) continue;
    const m = block.match(ipRe);
    if (m) out.push(m[0].replace(/^IPv4[^0-9]*/i, ''));
  }
  return out;
}

function runIpconfig() {
  // WSL 内 PATH 可能不含 Windows System32；用绝对路径兜底
  const candidates = ['ipconfig.exe', '/mnt/c/Windows/System32/ipconfig.exe'];
  return new Promise((resolve) => {
    const tryNext = (i) => {
      if (i >= candidates.length) return resolve(null);
      execFile(candidates[i], [], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err || !stdout) return tryNext(i + 1);
        resolve(String(stdout));
      });
    };
    tryNext(0);
  });
}

/** 收集所有可手动选择的局域网/Tailnet 候选 IP（WSL 下以 Windows ipconfig 为准）。 */
async function listLanCandidates() {
  if (detectWsl()) {
    try {
      const out = await runIpconfig();
      const ips = parseIpconfig(out ?? '', { includeVpn: true });
      if (ips.length) return [...new Set(ips)];
    } catch { /* 回退 */ }
  }
  const ips = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = addr.address;
      if (!ip || ip.startsWith('127.') || ip.startsWith('169.254.')) continue;
      if (!ips.includes(ip)) ips.push(ip);
    }
  }
  return ips;
}

/** origin → 展示分组：local（本机）/ lan（局域网）/ public（公网域名）。复用代理的 Host 信任边界分类。 */
function originKindOf(origin) {
  try {
    const cls = classifyHost(new URL(origin).host);
    return cls === 'loopback' ? 'local' : cls;
  } catch {
    return 'public';
  }
}

/**
 * 创建 Pocket 服务。
 * @param {object} opts
 * @param {number} opts.dshPort   dsh web 实际端口（从 ctx.webServer.port 取）
 * @param {number} [opts.port]    代理端口（默认 3081）
 * @param {object} [opts.internals] 测试注入：createProxy / lanCandidates
 * @returns {PocketService}
 */
export function createPocketService({
  dshPort,
  port = 3081,
  internals = {},
  /** 代理注入 HTML 的内容（桌面端补丁等由 lib/index.js 传入；默认 randomUUID polyfill） */
  injectHtml,
  /** Gitee OAuth 认证配置（见 lib/proxy.mjs createPocketProxy 的 auth） */
  auth,
  /** OAuth 配置读取器：() => cfg|null；status() 用它产出安全视图与二维码 */
  getOAuthConfig,
  /** @type {() => string} dsh web 浏览器会话启动 token（issue #77；老版本返回空字符串） */
  launchToken = () => '',
  /** 日志（DSH 宿主 ctx.logger 有 info/warn/error；默认 console 无 info，自动退回 log）。 */
  log = console,
} = {}) {
  // ctx.logger 形状是 info/warn/error；console 只有 log/warn/error——info 做兜底兼容
  const logInfo = (...args) => (log.info ?? log.log).call(log, ...args);
  const createProxy = internals.createProxy ?? createPocketProxy;
  let lanCandidateCache = null;
  const getLanCandidates = async () => {
    if (internals.lanCandidates) return internals.lanCandidates();
    const now = Date.now();
    if (!lanCandidateCache || now - lanCandidateCache.at > 15000) {
      lanCandidateCache = { at: now, ips: await listLanCandidates() };
    }
    return lanCandidateCache.ips;
  };

  let proxy = null;
  /** 二维码缓存：URL → data URL promise。status() 每 3 秒轮询一次，不能每次都重新生成（CPU 密集）。 */
  const qrCache = new Map();
  const encodeQr = internals.encodeQr ?? qrDataUrl;
  async function qrCached(text) {
    if (!text) return null;
    if (!qrCache.has(text)) {
      if (qrCache.size >= 12) {
        // 只淘汰最旧一条，别殃及稳定的 origin 二维码
        const oldest = qrCache.keys().next().value;
        qrCache.delete(oldest);
      }
      qrCache.set(text, encodeQr(text).catch(() => null));
    }
    return qrCache.get(text);
  }

  return {
    dshPort,
    /** 启动代理（幂等）。端口被占（EADDRINUSE，如桌面版与普通环境同时运行）时自动尝试下一个端口。 */
    async startProxy() {
      if (proxy) return proxy;
      let lastErr = null;
      for (let p = port; p < port + 10; p++) {
        try {
          proxy = await createProxy({
            port: p,
            host: '0.0.0.0',
            upstream: { host: '127.0.0.1', port: dshPort },
            ...(injectHtml ? { injectHtml } : {}),
            ...(auth ? { auth } : {}),
            // dsh web 浏览器会话启动 token（issue #77）：实时取，新版 dsh 才有
            ...(launchToken ? { launchToken } : {}),
          });
          if (p !== port) {
            logInfo(`dsh-pocket: port ${port} busy, proxy on ${p} | 端口 ${port} 被占用，代理改用 ${p}`);
          }
          break;
        } catch (err) {
          if (err?.code !== 'EADDRINUSE') throw err; // 非端口冲突直接失败
          lastErr = err;
        }
      }
      if (!proxy) throw lastErr ?? new Error('proxy start failed | 代理启动失败');
      return proxy;
    },

    /** 状态快照（RPC 返回，不含敏感信息；二维码 data URL 本地生成 + 缓存）。 */
    async status() {
      const cfg = typeof getOAuthConfig === 'function' ? (getOAuthConfig() ?? null) : null;
      const origins = Array.isArray(cfg?.callbackOrigins) ? cfg.callbackOrigins : [];
      const originQrs = [];
      for (const origin of origins) {
        originQrs.push({ origin, kind: originKindOf(origin), qr: await qrCached(origin) });
      }
      return {
        proxyRunning: proxy !== null,
        proxyPort: proxy?.port ?? null,
        dshPort,
        lanCandidates: [...new Set(await getLanCandidates())],
        oauth: oauthView(cfg),
        originQrs,
      };
    },

    /** 停止一切（插件卸载时）。 */
    async dispose() {
      if (proxy) {
        const p = proxy;
        proxy = null;
        try { await p.close(); } catch { /* server 已关闭等边缘情况 */ }
      }
    },
  };
}
