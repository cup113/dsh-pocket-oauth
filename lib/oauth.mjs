// dsh-pocket Gitee OAuth 认证核心（代替旧 PIN 模型）
//
// 模型：
//   - 用户在自己 Gitee 账号下创建一个 OAuth 应用（个人可建、免审核），
//     「应用回调地址」注册多个条目（Gitee 支持多条，redirect_uri 与条目精确匹配）：
//       · http://127.0.0.1:3081/pocket-oauth/callback   —— 本机初始化绑定
//       · https://<固定域名>/pocket-oauth/callback        —— 用户自建隧道（命名隧道）
//       · http://<局域网IP>:3081/pocket-oauth/callback    —— 可选，局域网直连
//   - 本机浏览器打开 http://127.0.0.1:3081/pocket-setup 填 Client ID/Secret 与回调
//     origin 白名单，完成一次 OAuth 登录 → 绑定的 gitee uid 落盘（oauth.json，0o600）。
//   - 此后任何设备经白名单地址访问 3081，用**同一个** Gitee 账号 OAuth 登录即获得
//     会话 cookie（HttpOnly，绑定进程级 sessionKey，重启失效）——完全代替 PIN。
//
// 安全核心：访问权由「回调取回的 gitee uid == 绑定的 boundUid」决定；client 凭据与
// 回调白名单只决定能否发起/收回授权（app 谁都能建，不构成身份约束）。

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
/** Gitee OAuth 端点基址（测试可覆盖）。 */
export const DEFAULT_GITEE_BASE = 'https://gitee.com';

const oauthRel = join('dsh-pocket', 'oauth.json');

export function oauthConfigPath() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), oauthRel);
}

/**
 * 读取 OAuth 配置。
 * @returns {{clientId:string, clientSecret:string, callbackOrigins:string[], boundUid:string|null, boundLogin:string|null}|null}
 */
export function readOAuthConfig() {
  try {
    const raw = JSON.parse(readFileSync(oauthConfigPath(), 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return {
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

/** 浏览器/RPC 可见的安全视图：不含 secret。 */
export function oauthView(cfg) {
  return {
    configured: Boolean(cfg?.clientId && cfg?.clientSecret),
    callbackOrigins: Array.isArray(cfg?.callbackOrigins) ? [...cfg.callbackOrigins] : [],
    bound: Boolean(cfg?.boundUid),
    boundLogin: cfg?.boundLogin ?? null,
  };
}

/**
 * 归一化单个回调 origin：接受 `https://pocket.example.com`、`http://192.168.1.5:3081`
 * 一类**纯 origin**（不带 path/query/hash/用户名密码）；host 小写、去尾部斜杠。
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
  if ((u.username || u.password) || u.pathname !== '/' || u.search || u.hash) {
    return { error: `回调地址只允许「协议://主机[:端口]」：${raw} | callback origin must be scheme://host[:port] only` };
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
 * OAuth state 存储：随机 state → { purpose, expiresAt }，单次使用、短 TTL。
 * purpose: 'login'（日常登录）| 'bind'（初始化绑定，仅 loopback 可发起）。
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
    create(purpose, now = Date.now()) {
      prune(now);
      if (states.size >= max) {
        // 满了先丢最早的（FIFO 兜底，正常流量远到不了上限）
        const first = states.keys().next().value;
        states.delete(first);
      }
      const s = random(16).toString('hex');
      states.set(s, { purpose, expiresAt: now + ttlMs });
      return s;
    },
    /** 消费 state（单次使用）：有效返回 purpose，无效/过期返回 null。 */
    consume(state, now = Date.now()) {
      const rec = states.get(String(state ?? ''));
      if (!rec) return null;
      states.delete(String(state ?? ''));
      if (rec.expiresAt <= now) return null;
      return rec.purpose;
    },
  };
}

/** 会话 cookie 值：sha256(uid:sessionKey)——绑定进程级 sessionKey，重启即失效。 */
export function sessionCookieValue(uid, sessionKey) {
  return createHash('sha256').update(`${uid}:${sessionKey}`).digest('hex');
}

/** Gitee 授权页 URL（authorization code 流）。 */
export function giteeAuthorizeUrl({ clientId, redirectUri, state, baseUrl = DEFAULT_GITEE_BASE, scope = 'user_info' }) {
  const u = new URL('/oauth/authorize', baseUrl);
  u.searchParams.set('client_id', String(clientId));
  u.searchParams.set('redirect_uri', String(redirectUri));
  u.searchParams.set('response_type', 'code');
  if (state) u.searchParams.set('state', String(state));
  if (scope) u.searchParams.set('scope', String(scope));
  return u.toString();
}

/**
 * 用授权码换取 gitee 用户身份（token + /api/v5/user 一步完成，access token 用完即弃）。
 * @param {object} opts
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string} opts.code
 * @param {string} opts.redirectUri 必须与 authorize 时一致
 * @param {typeof fetch} [opts.fetchImpl] 测试注入
 * @param {string} [opts.baseUrl] 测试注入
 * @returns {Promise<{id:string, login:string}>}
 */
export async function exchangeCodeForUser({ clientId, clientSecret, code, redirectUri, fetchImpl = fetch, baseUrl = DEFAULT_GITEE_BASE }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code ?? ''),
    client_id: String(clientId ?? ''),
    client_secret: String(clientSecret ?? ''),
    redirect_uri: String(redirectUri ?? ''),
  });
  let tokenJson;
  try {
    const res = await fetchImpl(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    tokenJson = await res.json().catch(() => ({}));
    if (!res.ok || !tokenJson?.access_token) {
      const desc = tokenJson?.error_description ?? tokenJson?.error ?? `HTTP ${res.status}`;
      throw new Error(`Gitee 换取令牌失败：${desc} | Gitee token exchange failed: ${desc}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`无法连接 Gitee（${baseUrl}）：${err.message} | cannot reach Gitee: ${err.message}`);
    }
    throw err;
  }
  let user;
  try {
    const res = await fetchImpl(`${baseUrl}/api/v5/user?access_token=${encodeURIComponent(tokenJson.access_token)}`);
    user = await res.json().catch(() => ({}));
    if (!res.ok || user?.id == null) {
      const desc = user?.message ?? `HTTP ${res.status}`;
      throw new Error(`Gitee 获取用户信息失败：${desc} | Gitee user info failed: ${desc}`);
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`无法连接 Gitee（${baseUrl}）：${err.message} | cannot reach Gitee: ${err.message}`);
    }
    throw err;
  }
  return { id: String(user.id), login: typeof user.login === 'string' ? user.login : String(user.id) };
}
