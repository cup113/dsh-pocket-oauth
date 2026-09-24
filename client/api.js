// dsh-pocket 设置页签 RPC 契约（client 与 host 共享）
export const POCKET_RPC_CHANNEL = '/dsh-pocket';
export const MOBILE_RIGHTBAR_ATTRIBUTE = 'data-dsh-pocket-mobile-rightbar';
export const MOBILE_RIGHTBAR_EVENT = 'dsh-pocket:mobile-rightbar';

export const POCKET_ENDPOINTS = Object.freeze({
  status: 'pocket.status',
  version: 'pocket.version',
  update: 'pocket.update',
  restart: 'pocket.restart',
  mobileRightbarSetEnabled: 'mobile.rightbar.setEnabled',
  pocketReset: 'pocket.reset',
  // OAuth 管理（loopback-only RPC 通道内调用）
  oauthRotateSession: 'oauth.rotateSession',
  oauthUnbind: 'oauth.unbind',
  // 移动端「复制文件内容」（issue #17）：手机经此 RPC 让主机读取文件正文，
  // 再写入剪贴板——因为手机无法直接打开电脑上的文件。
  fileRead: 'pocket.fileRead',
});

/** 语义化版本比较：a > b 返回正数，相等 0，a < b 负数（数字段 + 预发布后缀）。 */
export function compareVersions(a, b) {
  const pa = String(a).replace(/^[vV]/, '').split('.');
  const pb = String(b).replace(/^[vV]/, '').split('.');
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i], 10) || 0;
    const y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x - y;
  }
  // 数字段相等：无预发布后缀的更新；都有后缀时按段比较（alpha < beta < rc…，
  // 数字段按数值：rc.9 < rc.10）
  const aPre = String(a).replace(/^[vV]/, '').match(/-.*$/)?.[0] ?? '';
  const bPre = String(b).replace(/^[vV]/, '').match(/-.*$/)?.[0] ?? '';
  if (!aPre && !bPre) return 0;
  if (!aPre) return 1;
  if (!bPre) return -1;
  // 逐段比较：数字段按数值、文本段按字典序
  const aParts = aPre.slice(1).split('.');
  const bParts = bPre.slice(1).split('.');
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ax = aParts[i] ?? '';
    const bx = bParts[i] ?? '';
    if (ax === bx) continue;
    const aNum = /^\d+$/.test(ax);
    const bNum = /^\d+$/.test(bx);
    if (aNum && bNum) return Number(ax) - Number(bx); // 数值比较
    if (aNum) return 1; // 数字段 > 文本段
    if (bNum) return -1;
    return ax < bx ? -1 : 1; // 字典序
  }
  return 0;
}

/** origin 的展示分组兜底（服务端 kind 缺失时按 host 推断；与 classifyHost 同一套网段）。 */
export function fallbackKind(origin) {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || /^127\./.test(h)) return 'local';
    if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/.test(h)) return 'lan';
    if (/^(?:fe80:|f[cd][0-9a-f]{2}:)/.test(h) || h.endsWith('.local') || !h.includes('.')) return 'lan';
    return 'public';
  } catch {
    return 'public';
  }
}

const ORIGIN_KINDS = new Set(['local', 'lan', 'public']);

/** 浏览器可见的状态字段（无敏感信息；含二维码 data URL 与 OAuth 安全面视图）。 */
export function redactStatus(s) {
  return {
    proxyRunning: s?.proxyRunning === true,
    proxyPort: s?.proxyPort ?? null,
    dshPort: s?.dshPort ?? null,
    lanCandidates: Array.isArray(s?.lanCandidates) ? s.lanCandidates : [],
    oauth: {
      // 鉴权方（Gitee / GitHub）：缺省/非法一律按 gitee 解释（与后端 readOAuthConfig 一致）
      provider: s?.oauth?.provider === 'github' ? 'github' : 'gitee',
      configured: s?.oauth?.configured === true,
      callbackOrigins: Array.isArray(s?.oauth?.callbackOrigins) ? s.oauth.callbackOrigins : [],
      bound: s?.oauth?.bound === true,
      boundLogin: s?.oauth?.boundLogin ?? null,
    },
    originQrs: Array.isArray(s?.originQrs)
      ? s.originQrs.filter((o) => o && typeof o.origin === 'string').map((o) => ({
          origin: o.origin,
          // 展示分组（local/lan/public）：服务端没给（旧版本）时按 host 兜底推断
          kind: ORIGIN_KINDS.has(o.kind) ? o.kind : fallbackKind(o.origin),
          qr: o.qr ?? null,
        }))
      : [],
  };
}

/**
 * 写剪贴板（浏览器端共享实现）：优先 navigator.clipboard（安全上下文），
 * 非安全上下文（局域网 http://IP 入口）回退 execCommand——否则手机上点「复制」
 * 会静默失败。设置页与移动端文件复制共用本实现。
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 回退 execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * 生成「排障上下文」markdown（纯函数、无 DOM）：用户目标 + 架构/认证模型 +
 * 当前状态快照 + 常见坑清单。供设置页一键复制给外部 AI 接管排障。
 * 敏感信息天然不包含：status/version 均为脱敏视图（Client Secret 从不回显，
 * Client ID 不出现在任何状态接口里）。
 * @param {object} status pocket.status 返回值（redact 后形状亦可）
 * @param {{version?:{current?:string,loaded?:string,installKind?:string|null},ua?:string}} [meta]
 * @returns {string}
 */
export function buildTroubleshootingContext(status, meta = {}) {
  const s = status ?? {};
  const oauth = s.oauth ?? {};
  // 鉴权方：缺省/非法一律按 gitee 解释（与 lib/oauth.mjs normalizeProvider 一致）
  const provider = oauth.provider === 'github' ? 'github' : 'gitee';
  const label = provider === 'github' ? 'GitHub' : 'Gitee';
  const appUrl = provider === 'github' ? 'github.com/settings/developers' : 'gitee.com/oauth/applications';
  const scope = provider === 'github' ? 'read:user' : 'user_info';
  const netTargets = provider === 'github' ? 'github.com 与 api.github.com' : 'gitee.com';
  const groups = { local: [], lan: [], public: [] };
  for (const o of s.originQrs ?? []) {
    const kind = ORIGIN_KINDS.has(o?.kind) ? o.kind : fallbackKind(o?.origin ?? '');
    if (o?.origin) groups[kind].push(o.origin);
  }
  const origins = (s.oauth?.callbackOrigins ?? []);
  for (const origin of origins) {
    const kind = fallbackKind(origin);
    if (!groups[kind].includes(origin)) groups[kind].push(origin);
  }
  const list = (arr) => (arr.length ? arr.map((x) => `- ${x}`).join('\n') : '-（无）');
  const v = meta.version ?? {};
  const installKindText = { source: 'source（本地 git clone / link: 软链，更新走 git pull）', git: 'git（github: 规格安装，更新走重新 add）', unknown: 'unknown（未识别）' }[v.installKind] ?? v.installKind ?? '未知';
  return `# DSH Pocket 排障上下文
> 由 dsh-pocket 设置页「复制排障上下文」按钮生成，可直接粘贴给 AI 排障。敏感信息（Client Secret）从不回显，也不在本上下文中。

## 我要实现什么
不在电脑前时，通过以下地址**实时访问电脑上的 DeepSeek Harness（dsh web）**——手机/任意浏览器打开即是电脑界面，可发消息、看流式输出、点审批：
- 本机 / 局域网：
${list([...groups.local, ...groups.lan])}
- 公网（自建隧道 / 固定域名）：
${list(groups.public)}

## 系统如何工作（dsh-pocket 架构与认证模型）
- dsh-pocket 是 dsh web 的插件：在本机起一个**单端口反向代理**（默认 0.0.0.0:${s.proxyPort ?? 3081}），把入站请求的 Host/Origin 改写成 127.0.0.1:${s.dshPort ?? 3080}（loopback）后转发；HTTP 与 WebSocket 全透传，所以手机看到的就是电脑上的界面。
- 公网入口由用户**自建隧道**（必须有固定域名）指向 \`http://127.0.0.1:${s.proxyPort ?? 3081}\`；隧道/反代**必须保持原域名 Host 转发**（若把 Host 改写成 127.0.0.1，公网请求会被判为本机而免认证）。
- 认证 = **${label} OAuth**（初始化时在 Gitee / GitHub 中二选一）：本机浏览器打开 \`http://127.0.0.1:${s.proxyPort ?? 3081}/pocket-setup\` 选定鉴权方并绑定一个账号（uid）；此后任意设备经白名单地址用**同一个** ${label} 账号登录换会话 cookie（HttpOnly，绑定 dsh web 进程级密钥——**dsh web 重启后所有设备需重新登录**，属预期）。provider 与 uid 都要对上，换家（Gitee ⇄ GitHub）需重新绑定。
- ${label} OAuth 应用（${appUrl}，权限 ${scope}；GitHub 免审核）的「回调地址」与插件白名单**逐字符一致**：每条 = \`<访问地址>/pocket-oauth/callback\`（协议、域名、端口都要一样）。

## 当前状态快照
- 插件版本：${v.current ? `v${v.current}` : '未知'}${v.loaded ? `（进程运行 v${v.loaded}）` : ''}；安装方式：${installKindText}
- 代理：${s.proxyRunning === true ? `运行中，端口 ${s.proxyPort ?? '?'}` : '未运行/启动中'}；上游 dsh web 端口：${s.dshPort ?? '?'}
- ${label} OAuth：${oauth.configured ? '已配置' : '未配置'}${oauth.bound ? `，已绑定账号 ${oauth.boundLogin ?? '?'}` : '，未绑定账号'}；回调白名单 ${oauth.callbackOrigins?.length ?? origins.length ?? 0} 条
- 本机局域网 IP 候选：${(s.lanCandidates ?? []).join('、') || '无'}
- 浏览器 UA：${meta.ua ?? '未提供'}

## 常见坑（按命中率排序）
1. ${label} 报「redirect_uri 不一致/授权未完成」→ 回调地址没有逐字符匹配（http/https、域名、端口、路径），${label} 应用与插件白名单两处都要一致。
2. Safari 打不开 http:// + 纯 IP 入口（反复跳转）→ Safari 不在该类源上保存握手 cookie；换 Chromium 系浏览器，或改用 https 固定域名入口。
3. 公网域名打开异常/被拒 → 反代把 Host 改写成了 127.0.0.1，或该域名不在白名单/${label} 回调中。
4. 代理端口顺延（3081 被占自动换 3082）→ ${label} 回调里的端口全部失配，需同步改两处。
5. dsh web 重启/更新后手机被踢回登录页 → 会话绑定进程级密钥，属预期设计。
6. 选了 GitHub 时国内网络不稳 → 需能出网访问 ${netTargets}；国内用户选 Gitee 更稳（换家即在 /pocket-setup 重选并重新绑定）。
`;
}
