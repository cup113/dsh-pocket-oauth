// 网络地址分类的唯一来源（Host 信任边界 / 局域网候选 / 来源地址收紧共用）。
//
// 这些判定原本在 lib/proxy.mjs 与 lib/service.mjs 里各写了一份正则与常量；
// 两边都是「认错网段 = 要么公网裸奔、要么本机被挡」，所以集中到这里，避免漂移。
//
// 注意兜底方向由调用方决定（fail-open / fail-closed 不同）：
//   - classifyHost：host 认不出的形态按 loopback 处理（历史行为，避免裸 IPv6 把本机访问判成公网）；
//   - classifySource：源地址认不出时按 public 处理（唯一不可伪造的信息，宁可收紧不可放松）。
// 本模块只提供判定原语，不替调用方做兜底决策。

/** RFC1918 私网 + CGNAT 100.64/10（RFC 6598，Tailscale/ZeroTier 默认网段，公网不可路由）。 */
const PRIVATE_IPV4_RE = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/;

/** 精确 loopback 主机名（不含 127.x 网段，用 isLoopbackHost）。
 *  用 Set 而非字符串比较：新代码应走判定原语，别再散落 === 比较。 */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * 取出 Host / 主机名里的裸主机名：去端口、去 `[::1]` 方括号、小写、trim。
 * 不合法或空字符串返回 ''。
 * @param {string} host `127.0.0.1:3081`、`[::1]:3081`、`Pocket.Example.com`
 * @returns {string}
 */
export function normalizeHostname(host) {
  let name = String(host ?? '').trim().toLowerCase();
  if (name.startsWith('[')) {
    const end = name.indexOf(']');
    if (end >= 0) name = name.slice(1, end); // [::1]:3081 → ::1
  } else {
    name = name.replace(/:\d+$/, ''); // hostname:3081 / 127.0.0.1:3081 → 去掉端口
  }
  return name;
}

/** 该主机名是否回环（localhost / 127.0.0.1 / ::1 / 0.0.0.0，不含 127.x 整段）。 */
export function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.has(String(hostname ?? ''));
}

/** 该主机名是否私网 IPv4（RFC1918 或 CGNAT 100.64/10）。 */
export function isPrivateIPv4(hostname) {
  return PRIVATE_IPV4_RE.test(String(hostname ?? ''));
}
