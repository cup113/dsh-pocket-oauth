// dsh-pocket 远程操控组件 Web RPC（loopback-only）：设置页「手机访问」⇄ Host 的通道。
//
// 通道 /dsh-pocket 只服务「远程操控」的端点（代理状态、OAuth 管理、更新/重启/恢复出厂）。
// 手机端组件（子包 dsh-pocket-mobile）是纯客户端实现、不注册宿主端点：它过去的右栏开关 /
// 复制文件内容端点已随旧移动端适配一起删除，现在没有第二条通道。
//
// 传输层（webServer 挂载 / rpc.handle 回退 / 信任栅栏 / 4xx-5xx 分支）在 lib/rpc-route.js，
// wire 协议与 dsh-client-connection 的 /api 路由逐分支一致。

import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS, redactStatus } from '../client/api.js';
import { installRpcChannel, ok, fail } from './rpc-route.js';

/** 各平台停止 dsh web 进程的命令（Windows 没有 lsof/kill）。 */
export function killHint(port) {
  if (process.platform === 'win32') {
    return `netstat -ano | findstr :${port}（找 LISTENING 的 PID）→ taskkill /PID <PID> /F`;
  }
  return `lsof -ti :${port} | xargs kill -9`;
}

/** 注册 /dsh-pocket 逻辑通道（仅本机 loopback 可调）。
 * 优先直接挂到本插件 inject 的 webServer 上（dsh v0.1.5-alpha.1+ 兼容路径），
 * 不可用时回退 ctx.connection.rpc.handle（旧版 dsh 兼容路径）。
 * wire 协议两条路径完全一致：client-request → handler → server-response。 */
export function installPocketRpc(ctx, { service, log = console, desktop = false, runUpdate = null, restart = null, restartNotice = null, getOAuthView = null, rotateSession = null, unbindOAuth = null, resetPocket = null }) {
  const pocketRpcHandler = async (endpoint, payload = {}, signal) => {
    if (signal?.aborted) return fail('cancelled', 'The request was cancelled.');

    // status 响应：服务状态 + 重启提示 + 停止命令 + 桌面端标志 + OAuth 安全面视图
    const statusPayload = async () => {
      let notice = null;
      try { notice = (await restartNotice?.()) ?? null; } catch { notice = null; }
      const s = await service.status();
      return ok({
        ...redactStatus(s),
        desktop,
        restartNotice: notice,
        killHint: killHint(s.dshPort ?? 3080),
        oauth: getOAuthView?.() ?? { provider: 'gitee', configured: false, callbackOrigins: [], bound: false, boundLogin: null },
      });
    };

    try {
      if (endpoint === POCKET_ENDPOINTS.status) {
        return await statusPayload();
      }
      if (endpoint === POCKET_ENDPOINTS.oauthRotateSession) {
        // 登出所有设备：轮换进程级会话密钥，已下发的会话 cookie 立即全部失效
        if (!rotateSession) return fail('bad-request', '会话轮换不可用 | session rotation unavailable');
        rotateSession();
        return ok({ rotated: true });
      }
      if (endpoint === POCKET_ENDPOINTS.oauthUnbind) {
        // 解除绑定：保留凭据与回调白名单，仅清 boundUid；重新绑定走本机 /pocket-setup
        if (!unbindOAuth) return fail('bad-request', '解除绑定不可用 | unbind unavailable');
        return ok({ oauth: unbindOAuth() });
      }
      if (endpoint === POCKET_ENDPOINTS.pocketReset) {
        // 恢复出厂设置：必须显式确认（payload.confirm === true），清空设置与 OAuth 配置，
        // 返回完整 status 供前端直接替换（旧会话立即作废，需重新初始化）。
        if (payload?.confirm !== true) {
          return fail('bad-request', '恢复出厂设置需要确认 | factory reset requires confirmation');
        }
        if (!resetPocket) return fail('bad-request', '恢复出厂设置不可用 | factory reset unavailable');
        try {
          resetPocket();
          return await statusPayload();
        } catch (err) {
          return fail('bad-request', err?.message ?? String(err));
        }
      }
      if (endpoint === POCKET_ENDPOINTS.version) {
        return ok({
          current: runUpdate?.currentVersion?.() ?? null,
          loaded: runUpdate?.loadedVersion?.() ?? null,
          // 安装类型（source/git/unknown）：设置页据此分支「更新失败时给哪条手动命令」
          installKind: runUpdate?.installKind?.() ?? null,
        });
      }
      if (endpoint === POCKET_ENDPOINTS.update) {
        // 桌面端：更新由 DSH Desktop 管理，这里关闭（不删除，仅禁用）
        if (desktop) return fail('bad-request', '桌面版更新由 DSH Desktop 管理，已在此环境停用 | updates are managed by DSH Desktop here');
        if (!runUpdate) return fail('bad-request', '更新不可用 | update unavailable');
        const result = await runUpdate.perform(payload?.profile ?? 'web');
        // 更新成功 → 自动重启生效（用户只点一次；helper 拉起失败则保持现状，可手动重启）
        if (result?.ok && restart) {
          const rr = restart();
          result.autoRestart = rr?.helperPid != null;
        }
        return ok(result);
      }
      if (endpoint === POCKET_ENDPOINTS.restart) {
        // 桌面端：重启由 DSH Desktop 管理，这里关闭（不删除，仅禁用）
        if (desktop) return fail('bad-request', '桌面版重启由 DSH Desktop 管理，已在此环境停用 | restart is managed by DSH Desktop here');
        if (!restart) return fail('bad-request', '重启不可用 | restart unavailable');
        const result = restart();
        // 重启拉起失败（helper 都没 spawn 出来）→ 如实报错，别让 UI 误报成功
        if (!result || result.helperPid == null) {
          return fail('bad-request', `重启失败：${result?.error ?? '未知'} | restart failed`);
        }
        const dshPort = service.dshPort ?? 3080;
        return ok({ ...result, hint: `重启后进程在后台运行；如需停止：${killHint(dshPort)}` });
      }
      return fail('bad-request', `Unknown endpoint: ${endpoint}`);
    } catch (err) {
      log.error?.('dsh-pocket: rpc %s failed | RPC 失败: %s', endpoint, err?.message ?? err);
      return fail('bad-request', err?.message ?? String(err));
    }
  };

  return installRpcChannel(ctx, { channel: POCKET_RPC_CHANNEL, handler: pocketRpcHandler, log, label: 'dsh-pocket' });
}
