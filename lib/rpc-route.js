// dsh-pocket RPC 传输层：把一条逻辑 RPC 通道挂到宿主 webServer
// （dsh v0.1.5-alpha.1+）或 ctx.connection.rpc.handle（旧版 dsh 回退），wire 协议与
// dsh-client-connection 的 /api 路由逐分支对齐。
//
// 当前唯一使用者：
//   - lib/web-rpc.js → 通道 /dsh-pocket（远程操控组件，本包 row dsh-pocket）
//
// 手机端组件（子包 dsh-pocket-mobile）是纯客户端实现，它过去那条 /dsh-pocket-mobile
// 通道随旧移动端适配一起删除；将来它若需要宿主端点可以直接复用本文件（子包通过
// `dsh-pocket/lib/rpc-route.js` 引入，根 package.json 的 exports["./lib/*"] 已放行）——
// 所以这里**不要**引入第三方依赖、也不要用只在根包里才存在的相对路径。
//
// 这里只做传输与信任栅栏，端点语义都由调用方的 handler 决定。

/** 单次请求体上限默认值：8 MB（控制载荷都是小 JSON）。 */
export const DEFAULT_RPC_BODY_MAX = 8 * 1024 * 1024;

/** endpoint 段字符（与 dsh-client-connection 的 ENDPOINT_SEGMENT_PATTERN 对齐）。 */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;

/** client-request 信封校验失败时使用的兜底 rpcId（与 dsh 内部 INVALID_REQUEST_RPC_ID 对齐）。 */
const INVALID_REQUEST_RPC_ID = 'invalid-request';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * 从 `${channel}/<endpoint>` 路径里取出 endpoint，段非法时返回 undefined。
 * 与 dsh-client-connection 的 endpointFromPath 字段对字段一致。
 */
export function endpointFromPath(channel, pathname) {
  if (!pathname.startsWith(`${channel}/`)) return undefined;
  const endpoint = pathname.slice(channel.length + 1);
  if (endpoint.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || !ENDPOINT_SEGMENT_PATTERN.test(seg))) {
    return undefined;
  }
  return endpoint;
}

/** 构造 server-response JSON 串（与 dsh-client-connection 的 fullResponse 字段对齐）。 */
export function serverResponseJson(rpcId, result) {
  return JSON.stringify({ type: 'server-response', rpcId, result });
}

/**
 * 旧版 dsh / 无 connection.requestRejection 时的最小信任栅栏：仅放行 loopback Host，
 * 拒 cross-site fetch 与 Origin 不匹配（与 isTrustedApiRequest 的 loopback 分支对齐）。
 * 新版 dsh 走 ctx.connection.requestRejection(req)（401/403 都在那里），本函数只是兜底。
 */
export function isTrustedLoopbackRequest(req) {
  const host = req.headers?.host;
  if (!host) return false;
  const hostName = host.split(':')[0];
  if (!LOOPBACK_HOSTNAMES.has(hostName)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

/**
 * 把 RPC handler 包装成 fetch-shaped handler，逐分支复刻 dsh-client-connection 的
 * rpcFetchHandler：404（非 POST / 无 endpoint）、415（content-type）、400（非 JSON）、
 * gateway/bad-request（信封非法 / method 与 endpoint 不匹配）、500（handler 抛错），
 * 成功返回 server-response JSON（200）。wire 协议与原 /api 通道逐字节一致。
 */
export function rpcFetchHandler(channel, handler, log, label = 'dsh-pocket') {
  return {
    async fetch(request) {
      const endpoint = endpointFromPath(channel, new URL(request.url).pathname);
      if (request.method !== 'POST' || endpoint === undefined) {
        return new Response('not found', { status: 404 });
      }
      const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response('body is not JSON', { status: 400 });
      }
      // 最小信封校验（不依赖 @deepseek-ai/dsh-host-apiproxy 的 clientRequestSchema，
      // 形状稳定：{ rpcId: string, method: string, payload?: any }）。
      const rpcId = body && typeof body.rpcId === 'string' ? body.rpcId : INVALID_REQUEST_RPC_ID;
      const method = body && typeof body.method === 'string' ? body.method : null;
      if (rpcId === INVALID_REQUEST_RPC_ID || method === null) {
        return new Response(
          serverResponseJson(INVALID_REQUEST_RPC_ID, {
            ok: false,
            error: { code: 'bad-request', message: 'invalid client-request message', details: { issues: [] } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (method !== endpoint) {
        return new Response(
          serverResponseJson(rpcId, {
            ok: false,
            error: {
              code: 'bad-request',
              message: `method ${JSON.stringify(method)} does not match endpoint ${JSON.stringify(endpoint)}`,
              details: { issues: [] },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      try {
        const result = await handler(endpoint, body.payload, request.signal);
        return new Response(serverResponseJson(rpcId, result), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        log.error?.(`${label}: rpc %s failed | RPC 失败: %s`, endpoint, err?.message ?? err);
        return new Response(`handler failure: ${String(err)}`, { status: 500 });
      }
    },
  };
}

/**
 * node:http 请求 → fetch-shaped handler → node:http 响应的桥接。
 * 与 dsh-client-connection 的 bridge 行为一致：
 *   - res.close 时若响应未结束 → abort（client 主动断开不再等 handler）；
 *   - 声明 content-length 超 maxBodyBytes → 413 + 销毁 socket；
 *   - 流式读取超 maxBodyBytes → 413 + 销毁 socket（防无界缓冲）；
 *   - 把请求头里 string 值原样传给 fetch handler（数组头被丢弃，与原实现一致）；
 *   - 响应 body 流式回写，遇背压等 drain / close。
 */
export async function rpcHttpBridge(req, res, fetchHandler, maxBodyBytes) {
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });

  const declaredLen = req.headers['content-length'];
  if (declaredLen !== undefined && Number(declaredLen) > maxBodyBytes) {
    res.writeHead(413, { connection: 'close' });
    res.end();
    req.destroy();
    return;
  }
  const chunks = [];
  let received = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBodyBytes) { tooLarge = true; break; }
    chunks.push(chunk);
  }
  if (tooLarge) {
    res.writeHead(413, { connection: 'close' });
    res.end();
    req.destroy();
    return;
  }

  const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url}`;
  const init = {
    method: req.method ?? 'GET',
    headers: Object.fromEntries(
      Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    ),
    signal: abort.signal,
  };
  if (chunks.length > 0) init.body = Buffer.concat(chunks);
  const request = new Request(url, init);

  const response = await fetchHandler.fetch(request);
  const headers = Object.fromEntries(response.headers.entries());
  // 不写 content-length（流式响应长度未知），交由 Node 自动分块。
  res.writeHead(response.status, headers);
  if (response.body === null) { res.end(); return; }
  for await (const chunk of response.body) {
    if (!res.write(chunk)) {
      await new Promise((resolve) => {
        const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
        res.once('drain', done);
        res.once('close', done);
      });
    }
    if (res.writableEnded) break;
  }
  res.end();
}

/**
 * 直接把一条 RPC 通道挂到插件自己 inject 的 webServer 上。
 * 返回 disposer（同步或异步均可调用），返回 null 表示环境无 webServer（调用方应回退 rpc.handle）。
 *
 * 行为分支与 dsh-client-connection 的 register() /api 路由 1:1 对齐：
 *   - connection.requestRejection(req) 可用时（dsh v0.1.5-alpha.1+）→ 走它，
 *     401 unauthorized / 403 forbidden 都在那里判定（浏览器 cookie + Host/Origin 栅栏）；
 *   - 不可用时（旧版 dsh）→ 用 isTrustedLoopbackRequest 兜底，仅做 loopback 信任栅栏，
 *     浏览器 cookie 认证旧版本就没有，行为与原 rpc.handle({authority:'loopback'}) 一致；
 *   - 之后交给 rpcHttpBridge + rpcFetchHandler，复刻 /api 的 4xx/5xx/200 分支。
 */
export function mountRpcRoute(ctx, { channel, handler, log, bodyMax = DEFAULT_RPC_BODY_MAX, label = 'dsh-pocket' }) {
  const webServer = ctx?.webServer;
  if (!webServer || typeof webServer.register !== 'function') return null;
  // 必须持有 connection 本体并以**方法形式**调用 requestRejection（issue #117）：
  // dsh 的 HostConnectionService.requestRejection 是类方法，内部读 this.trustedHosts /
  // this.browserAuth。先把方法抽成裸函数（`const fn = ctx.connection.requestRejection`）
  // 再调用会丢失 this → TypeError → 被下面的 catch 兜底成 403，于是**任何**请求
  // （本机、带会话 cookie 的浏览器、移动端）都被判 forbidden，设置页 status RPC 全挂
  // （用户可见症状：局域网区块一直显示「代理未就绪…」，公网隧道开启报 403）。
  // dsh 自己的 /api 路由也是以方法形式调用的（见 client-connection 的 register()）；
  // 本仓库 lib/index.js 处理 authenticatedUrl 时同样用 fn.call(ctx.connection, ...) 绑定。
  // 等价写法：requestRejection.call(ctx.connection, req)（issue #117 报告者的建议）。
  const connection = ctx?.connection;
  const fetchHandler = rpcFetchHandler(channel, handler, log, label);
  const route = {
    kind: 'prefix',
    path: channel,
    handler: async (req, res) => {
      let rejection;
      if (typeof connection?.requestRejection === 'function') {
        try { rejection = connection.requestRejection(req); } catch { rejection = 403; }
      } else if (!isTrustedLoopbackRequest(req)) {
        rejection = 403;
      }
      if (rejection !== undefined) {
        res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      await rpcHttpBridge(req, res, fetchHandler, bodyMax);
    },
  };
  const registered = webServer.register(route);
  // register 可能返回 disposer、Promise<disposer> 或 undefined（仅写入路由表）。
  // 统一规整成「可幂等调用的清理函数」。
  return typeof registered === 'function'
    ? () => { try { registered(); } catch { /* 已清理 */ } }
    : (registered && typeof registered.then === 'function')
      ? (() => { let done = false; return async () => { if (done) return; done = true; try { const d = await registered; if (typeof d === 'function') d(); } catch { /* 已清理 */ } }; })()
      : () => {};
}

/**
 * 注册一条 RPC 通道：优先挂 webServer，其次回退 ctx.connection.rpc.handle（旧版 dsh）。
 * @param {object} ctx 插件上下文（需 inject webServer / connection）
 * @param {{channel:string, handler:Function, log?:object, bodyMax?:number, label?:string}} options
 * @returns {Function} disposer（幂等）
 */
export function installRpcChannel(ctx, { channel, handler, log = console, bodyMax = DEFAULT_RPC_BODY_MAX, label = 'dsh-pocket' }) {
  // 优先路径：直接挂到本插件 inject 的 webServer 上（dsh v0.1.5-alpha.1+）。
  // 该路径下 ctx.connection 仅用于 requestRejection（401/403 完整栅栏），即使
  // client-connection 已不再 inject webServer，本插件自己 inject 的 webServer 也照常工作。
  const directMount = mountRpcRoute(ctx, { channel, handler, log, bodyMax, label });
  if (directMount) return directMount;

  // 回退路径：旧版 dsh（无 webServer 服务，如 headless / 测试 fixture）走 rpc.handle。
  // { authority: 'loopback' } 旧版用、新版 Connection 从未消费，保留向后兼容。
  if (!ctx?.connection?.rpc?.handle) {
    log.warn?.(`${label}: DSH Host Connection RPC unavailable — settings tab disabled | 无 Connection RPC，设置页不可用`);
    return () => {};
  }
  return ctx.connection.rpc.handle(channel, handler, { authority: 'loopback' });
}

/** RPC 成功响应（与 dsh rpcResponseSchema 的成功分支一致）。 */
export function ok(value) {
  return { ok: true, value };
}

/**
 * 构造符合 DSH rpcErrorSchema 的错误（按 code 的 discriminated union，
 * details 必填且分分支定形；'internal' 不在合法 code 集合里）。
 */
export function fail(code, message) {
  if (code === 'cancelled') return { ok: false, error: { code: 'cancelled', message, details: {} } };
  // 其余一律归入 bad-request（issues 是自由数组）
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } };
}
