// dsh-pocket OAuth 认证核心（代替旧 PIN 模型）
//
// 模型：
//   - 用户在自己 Gitee **或** GitHub 账号下创建一个 OAuth 应用（个人可建、免审核），
//     「回调地址」注册多个条目（两家都支持多条，redirect_uri 与条目精确匹配）：
//       · http://127.0.0.1:3081/pocket-oauth/callback   —— 本机初始化绑定
//       · https://<固定域名>/pocket-oauth/callback        —— 用户自建隧道（命名隧道）
//       · http://<局域网IP>:3081/pocket-oauth/callback    —— 可选，局域网直连
//   - 初始化时**二选一**（provider 单选，默认 gitee）。本机浏览器打开
//     http://127.0.0.1:3081/pocket-setup 填 Client ID/Secret 与回调 origin 白名单，
//     完成一次 OAuth 登录 → 绑定的 uid 落盘（oauth.json，0o600，含 provider 字段）。
//   - 此后任何设备经白名单地址访问 3081，用**同一个账号**（同一 provider）OAuth
//     登录即获得会话 cookie（HttpOnly，绑定进程级 sessionKey，重启失效）——完全代替 PIN。
//
// 安全核心：访问权由「回调取回的 (provider, uid) == 落盘的 (provider, boundUid)」决定；
// client 凭据与回调白名单只决定能否发起/收回授权（app 谁都能建，不构成身份约束）。
// provider 也参与比对，避免两家 uid 撞号（gitee uid 4242 ≠ github uid 4242）。

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';

/** OAuth 回调路径（挂在每个白名单 origin 下）。 */
export const OAUTH_CALLBACK_PATH = '/pocket-oauth/callback';
/** 会话 cookie 名（HttpOnly；值为 sessionCookieValue(uid, sessionKey)）。 */
export const SESSION_COOKIE = 'dsh_pocket_session';
/** 会话 cookie 寿命（秒）：30 天，与旧 PIN cookie 一致。 */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * 支持的 OAuth 鉴权方表（端点、取用户风格、scope）。新增一家只需在这里加一项。
 *
 * 字段：
 *   - base/apiBase：web 站点与 REST API 基址（Gitee 两者同域 → apiBase 为 null 表示「同 base」）。
 *   - authorizePath/tokenPath/userPath：各家各自的端点路径（挂在上面的基址上）。
 *   - tokenHeaders：换票请求除表单 content-type 外**额外**要带的头
 *     （GitHub 不加 `Accept: application/json` 会回 form 编码，拿不到 access_token）。
 *   - userAuthStyle：取用户信息怎么带 token —— 'query'（Gitee：?access_token=）或
 *     'bearer'（GitHub：Authorization: Bearer）。
 *   - scope：授权的权限范围（Gitee 必须勾 user_info；GitHub 默认 read:user 即可）。
 *   - appUrl：用户创建 OAuth 应用的后台入口（提示页/初始化页展示用）。
 */
export const OAUTH_PROVIDERS = Object.freeze({
  gitee: Object.freeze({
    id: 'gitee',
    label: 'Gitee',
    base: 'https://gitee.com',
    apiBase: null, // 同 base
    authorizePath: '/oauth/authorize',
    tokenPath: '/oauth/token',
    userPath: '/api/v5/user',
    tokenHeaders: Object.freeze({}),
    userAuthStyle: 'query',
    scope: 'user_info',
    appUrl: 'https://gitee.com/oauth/applications',
  }),
  github: Object.freeze({
    id: 'github',
    label: 'GitHub',
    base: 'https://github.com',
    apiBase: 'https://api.github.com',
    authorizePath: '/login/oauth/authorize',
    tokenPath: '/login/oauth/access_token',
    userPath: '/user',
    tokenHeaders: Object.freeze({ accept: 'application/json' }),
    userAuthStyle: 'bearer',
    scope: 'read:user',
    appUrl: 'https://github.com/settings/developers',
  }),
});

/** provider id 归一化：只认 'github'，其余（含缺省/非法值）一律回退 'gitee'（旧 oauth.json 兼容）。 */
export function normalizeProvider(id) {
  return id === 'github' ? 'github' : 'gitee';
}

/** 取 provider 表项（id 归一化后保证存在）。 */
export function providerInfo(id) {
  return OAUTH_PROVIDERS[normalizeProvider(id)];
}

const oauthRel = join('dsh-pocket', 'oauth.json');

export function oauthConfigPath() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), oauthRel);
}

/**
 * 读取 OAuth 配置。
 * provider 缺省/非法一律按 'gitee' 解释：旧 oauth.json 没有该字段，升级后
 * 仍按 Gitee 工作，已登录设备的会话 cookie 公式未变、不断线。
 * @returns {{provider:string, clientId:string, clientSecret:string, callbackOrigins:string[], boundUid:string|null, boundLogin:string|null}|null}
 */
export function readOAuthConfig() {
  try {
    const raw = JSON.parse(readFileSync(oauthConfigPath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return {
      provider: normalizeProvider(raw.provider),
      clientId: typeof raw.clientId === 'string' ? raw.clientId : '',
      clientSecret: typeof raw.clientSecret === 'string' ? raw.clientSecret : '',
      callbackOrigins: Array.isArray(raw.callbackOrigins)
        ? raw.callbackOrigins.filter((o) => typeof o === 'string')
        : [],
      boundUid: typeof raw.boundUid === 'string' && raw.boundUid ? raw.boundUid : null,
      boundLogin: typeof raw.boundLogin === 'string' ? raw.boundLogin : null,
    };
  } catch {
    return null; // 无文件/损坏 → 未配置（fail closed）
  }
}

/** 写入 OAuth 配置（0o600；secret 落盘后 RPC 永不回显）。 */
export function writeOAuthConfig(cfg) {
  const p = oauthConfigPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

/** 清除 OAuth 配置（恢复出厂/解绑重置用）。 */
export function clearOAuthConfig() {
  try {
    rmSync(oauthConfigPath(), { force: true });
    return true;
  } catch {
    return false;
  }
}

/** 浏览器/RPC 可见的安全视图：不含 secret（provider 为归一化后的 id）。 */
export function oauthView(cfg) {
  return {
    provider: normalizeProvider(cfg?.provider),
    configured: Boolean(cfg?.clientId && cfg?.clientSecret),
    callbackOrigins: Array.isArray(cfg?.callbackOrigins) ? [...cfg.callbackOrigins] : [],
    bound: Boolean(cfg?.boundUid),
    boundLogin: cfg?.boundLogin ?? null,
  };
}

/**
 * 归一化单个回调 origin。两种写法都接受（用户经常把 OAuth 应用里登记的
 * 完整回调地址整条复制过来，不该为此报错）：
 *   - 纯 origin：`https://pocket.example.com`、`http://192.168.1.5:3081`；
 *   - 完整回调 URL：结尾恰好是 OAUTH_CALLBACK_PATH（允许尾斜杠、大小写不敏感），
 *     自动剥掉该路径后按纯 origin 处理。
 * 其余 path / query / hash / 用户名密码仍拒绝；host 小写、去尾部斜杠。
 * @returns {{origin:string}|{error:string}}
 */
export function normalizeOrigin(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: '回调地址不能为空 | callback origin is empty' };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { error: `回调地址格式不对：${raw} | invalid callback origin: ${raw}` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: `回调地址必须是 http(s):// 开头：${raw} | callback origin must start with http(s)://` };
  }
  let path = u.pathname.toLowerCase();
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const isCallbackUrl = path === OAUTH_CALLBACK_PATH.toLowerCase();
  if ((u.username || u.password) || (!isCallbackUrl && path !== '/') || u.search || u.hash) {
    return { error: `回调地址两种写法都可以：「协议://主机[:端口]」，或在 Gitee / GitHub 里复制的完整回调地址（…${OAUTH_CALLBACK_PATH}）；不接受其他路径：${raw} | use scheme://host[:port], or the full callback URL copied from Gitee/GitHub (…${OAUTH_CALLBACK_PATH}); other paths are rejected` };
  }
  const origin = `${u.protocol}//${u.host}`.toLowerCase();
  return { origin };
}

/**
 * 解析 origin 列表（textarea 多行文本或字符串数组）：逐条归一化 + 去重，上限 10 条。
 * @param {string|string[]} input
 * @returns {{origins:string[]}|{error:string}}
 */
export function parseOrigins(input) {
  const lines = Array.isArray(input)
    ? input.map((s) => String(s ?? ''))
    : String(input ?? '').split(/\r?\n|;|,/);
  const origins = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const r = normalizeOrigin(trimmed);
    if (r.error) return { error: r.error };
    if (!origins.includes(r.origin)) origins.push(r.origin);
  }
  if (origins.length === 0) {
    return { error: '至少填写一个回调地址（如 http://127.0.0.1:3081）| at least one callback origin is required' };
  }
  if (origins.length > 10) {
    return { error: '回调地址最多 10 条 | at most 10 callback origins' };
  }
  return { origins };
}

/**
 * OAuth state 存储：随机 state → { purpose, provider, expiresAt }，单次使用、短 TTL。
 * purpose: 'login'（日常登录）| 'bind'（初始化绑定，仅 loopback 可发起）。
 * provider 记进 state：回调用哪个 provider 的端点换票**只由 state 决定**，
 * 不信任任何客户端可控的请求参数（否则跨家换票/撞号比对都能被构造）。
 */
export function createStateStore({ ttlMs = 10 * 60_000, max = 1000, random = randomBytes } = {}) {
  const states = new Map();
  function prune(now) {
    for (const [k, v] of states) {
      if (v.expiresAt <= now) states.delete(k);
    }
  }
  return {
    /** 创建一个新 state，返回随机字符串。 */
    create(purpose, provider = 'gitee', now = Date.now()) {
      prune(now);
      if (states.size >= max) {
        // 满了先丢最早的（FIFO 兜底，正常流量远到不了上限）
        const first = states.keys().next().value;
        states.delete(first);
      }
      const s = random(16).toString('hex');
      states.set(s, { purpose, provider: normalizeProvider(provider), expiresAt: now + ttlMs });
      return s;
    },
    /** 消费 state（单次使用）：有效返回 { purpose, provider }，无效/过期返回 null。 */
    consume(state, now = Date.now()) {
      const key = String(state ?? '');
      const rec = states.get(key);
      if (!rec) return null;
      states.delete(key);
      if (rec.expiresAt <= now) return null;
      return { purpose: rec.purpose, provider: normalizeProvider(rec.provider) };
    },
  };
}

/** 会话 cookie 值：sha256(uid:sessionKey)——绑定进程级 sessionKey，重启即失效。 */
export function sessionCookieValue(uid, sessionKey) {
  return createHash('sha256').update(`${uid}:${sessionKey}`).digest('hex');
}

/**
 * provider 授权页 URL（authorization code 流）。
 * @param {object} opts
 * @param {string} [opts.provider] 'gitee' | 'github'（缺省/非法 → gitee）
 * @param {string} opts.clientId
 * @param {string} opts.redirectUri
 * @param {string} [opts.state]
 * @param {string} [opts.scope] 覆盖 provider 默认 scope
 * @param {string} [opts.base] 覆盖 provider 站点基址（测试注入）
 */
export function providerAuthorizeUrl({ provider, clientId, redirectUri, state, scope, base } = {}) {
  const p = providerInfo(provider);
  const u = new URL(p.authorizePath, base ?? p.base);
  u.searchParams.set('client_id', String(clientId));
  u.searchParams.set('redirect_uri', String(redirectUri));
  u.searchParams.set('response_type', 'code');
  if (state) u.searchParams.set('state', String(state));
  const sc = scope ?? p.scope;
  if (sc) u.searchParams.set('scope', String(sc));
  return u.toString();
}

/**
 * 用授权码换取用户身份（token + user 一步完成，access token 用完即弃，
 * GitHub 的 8 小时短时 token 因此也不受影响——不需要 refresh token）。
 * @param {object} opts
 * @param {string} [opts.provider] 'gitee' | 'github'（缺省/非法 → gitee）
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string} opts.code
 * @param {string} opts.redirectUri 必须与 authorize 时一致
 * @param {typeof fetch} [opts.fetchImpl] 测试注入
 * @param {string} [opts.base] 覆盖 web 站点基址（authorize/token；测试注入）
 * @param {string} [opts.apiBase] 覆盖 REST API 基址（测试注入）
 * @returns {Promise<{id:string, login:string}>}
 */
export async function exchangeCodeForUser({
  provider, clientId, clientSecret, code, redirectUri, fetchImpl = fetch, base, apiBase,
} = {}) {
  const p = providerInfo(provider);
  const webBase = base ?? p.base;
  // Gitee 的用户 API 与 web 同域（apiBase 为 null）→ 跟随 base 覆盖；
  // GitHub 的 API 在 api.github.com（异域）→ 用显式 apiBase 或表里的默认值。
  const userBase = apiBase ?? p.apiBase ?? webBase;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code ?? ''),
    client_id: String(clientId ?? ''),
    client_secret: String(clientSecret ?? ''),
    redirect_uri: String(redirectUri ?? ''),
  });
  let tokenJson;
  try {
    const res = await fetchImpl(`${webBase}${p.tokenPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...p.tokenHeaders },
      body: body.toString(),
    });
    tokenJson = await res.json().catch(() => ({}));
    if (!res.ok || !tokenJson?.access_token) {
      // GitHub 换票失败回 200 + {error} JSON（不是 4xx），本分支天然兜住。
      const desc = tokenJson?.error_description ?? tokenJson?.error ?? `HTTP ${res.status}`;
      throw new Error(`${p.label} 换取令牌失败：${desc} | ${p.label} token exchange failed: ${desc}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`无法连接 ${p.label}（${webBase}）：${err.message} | cannot reach ${p.label}: ${err.message}`);
    }
    throw err;
  }
  const token = encodeURIComponent(tokenJson.access_token);
  const userUrl = p.userAuthStyle === 'bearer'
    ? `${userBase}${p.userPath}`
    : `${userBase}${p.userPath}?access_token=${token}`;
  const userHeaders = p.userAuthStyle === 'bearer'
    ? { authorization: `Bearer ${tokenJson.access_token}`, accept: 'application/json' }
    : {};
  let user;
  try {
    const res = await fetchImpl(userUrl, { headers: userHeaders });
    user = await res.json().catch(() => ({}));
    if (!res.ok || user?.id == null) {
      const desc = user?.message ?? `HTTP ${res.status}`;
      throw new Error(`${p.label} 获取用户信息失败：${desc} | ${p.label} user info failed: ${desc}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`无法连接 ${p.label}（${userBase}）：${err.message} | cannot reach ${p.label}: ${err.message}`);
    }
    throw err;
  }
  return { id: String(user.id), login: typeof user.login === 'string' ? user.login : String(user.id) };
}
