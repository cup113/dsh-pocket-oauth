// dsh-pocket 网页客户端：
//   1. 设置页签「手机访问」（Gitee OAuth 绑定状态 + 访问地址二维码 + 更新/重启提示）
//   2. 移动端适配（移植自 MIT 项目 dsh-web-mobile，见 client/mobile/LICENSE.dsh-web-mobile）
//
// 手机扫码打开的就是电脑上的 dsh web，实时同步；窄屏自动变成抽屉布局。
// 认证 = Gitee OAuth（v3）：本机一次初始化绑定账号，手机经任意白名单地址
// 用同一账号登录即获得会话（代替旧 PIN）。

import { createElement as h, useEffect, useRef, useState } from 'react';

import { POCKET_RPC_CHANNEL, POCKET_ENDPOINTS, MOBILE_RIGHTBAR_ATTRIBUTE, MOBILE_RIGHTBAR_EVENT, redactStatus, compareVersions, fallbackKind, copyText, buildTroubleshootingContext } from './api.js';
import { mobileApply } from './mobile/mobile-apply.tsx';
import { NS as POCKET_NS, zh as POCKET_ZH, en as POCKET_EN } from './pocket-locales.js';

const name = 'dsh-pocket';
const inject = ['slots', 'connection', 'layout', 'locale', 'sessionLogDownload'];

// 词典在 pocket-locales.js；这里只做「取 key → 替换 {占位符} → 字符串」。
// 不依赖 DSH t() 的插值能力，避免行为不一致。
function fmt(t, key, vars) {
  let s = t(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = String(s).split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

// 更新失败时的手动更新指引：按安装方式分支（与 lib/index.js performManagedUpdate 对应）。
// source（link: 到本地 clone）→ git pull；github: 规格安装 → 重跑 add 重新 pin main 提交。
function manualUpdateCmd(kind) {
  if (kind === 'source') return 'git pull 后重启 dsh web';
  return 'dsh plugin --profile web add github:cup113/dsh-pocket-oauth -w';
}

/** 鉴权方展示名（与 lib/oauth.mjs normalizeProvider + label 一致）。 */
function providerLabel(provider) {
  return provider === 'github' ? 'GitHub' : 'Gitee';
}

// 官方 DeepSeek Harness 设计系统（dsh-client-ui-theme design-platform.css）：
// 按钮 md=36px 胶囊形 / sm=28px；品牌色 --dsw-alias-brand-primary；
// hover 走 --dsw-alias-button-*-hover；间距 4px 栅格；正文 13px。
const styles = {
  card: { background: 'var(--dsw-alias-bg-layer-1,#fff)', border: '1px solid var(--dsw-alias-border-l2,#e5e7eb)', borderRadius: 12, padding: '16px 20px', maxWidth: 480 },
  block: { borderTop: '1px solid var(--dsw-alias-border-l2,#e5e7eb)', marginTop: 16, paddingTop: 16 },
  muted: { color: 'var(--dsw-alias-label-tertiary,#8b93a1)', fontSize: 12, lineHeight: 1.5 },
  code: { fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, wordBreak: 'break-all', margin: '6px 0 10px', color: 'var(--dsw-alias-label-primary,inherit)' },
  // 主按钮：官方 md 胶囊形（36px）
  primary: { font: 'inherit', cursor: 'pointer', border: 'none', background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary,#4f6ef7))', color: 'var(--dsw-alias-label-primary-foreground, #fff)', height: 36, padding: '0 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  // 次级按钮：官方 outline/ghost 胶囊形
  btn: { font: 'inherit', cursor: 'pointer', border: '1px solid var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l2,#d1d5db))', background: 'var(--dsw-alias-bg-layer-1,#fff)', color: 'var(--dsw-alias-label-primary,inherit)', height: 36, padding: '0 16px', borderRadius: 999, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  qr: { width: 220, height: 220, borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2,#e5e7eb)', margin: '8px 0' },
  warn: { color: 'var(--dsw-alias-state-warn-primary,#b45309)', fontSize: 12, lineHeight: 1.5 },
};

function applyMobileRightbarSetting(enabled) {
  const on = enabled !== false;
  document.body?.setAttribute(MOBILE_RIGHTBAR_ATTRIBUTE, on ? 'on' : 'off');
  window.dispatchEvent(new CustomEvent(MOBILE_RIGHTBAR_EVENT, { detail: { enabled: on } }));
}

function PocketSettingsTab({ rpcCall, t }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [restartNotice, setRestartNotice] = useState(false); // 重启后提示
  const [updateInfo, setUpdateInfo] = useState(null); // { current, latest, updating, result, startedAt } | null
  const [isDesktop, setIsDesktop] = useState(false); // DSH Desktop（Electron）环境：更新/重启由桌面版管理
  const [installKind, setInstallKind] = useState(null); // source（git clone）/ git（github: 规格）/ unknown
  const [now, setNow] = useState(Date.now()); // 每秒 tick，驱动倒计时

  // 进行中操作的「已等待 X 秒」倒计时
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = (startedAt) => (startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);

  const call = async (endpoint, payload) => {
    const res = await rpcCall(endpoint, payload);
    if (!res?.ok) throw new Error(res?.error?.message ?? 'RPC failed');
    return res.value;
  };

  const load = async () => {
    try {
      const s = await call(POCKET_ENDPOINTS.status, {});
      setStatus(s);
      applyMobileRightbarSetting(s.mobileRightbarEnabled);
      if (s.desktop) setIsDesktop(true);
      if (s.restartNotice) {
        // 新进程确认起来了：显示一次「已重启」，清掉旧的更新横幅（单状态，不并存），
        // 然后自动刷新页面加载新代码——不用用户手动刷新
        setRestartNotice(true);
        setUpdateInfo(null);
        if (!sessionStorage.getItem('dshp-auto-reloaded')) {
          sessionStorage.setItem('dshp-auto-reloaded', '1');
          setTimeout(() => { try { location.reload(); } catch { /* 忽略 */ } }, 2000);
        }
      }
    } catch { /* 忽略瞬时失败 */ }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  // 每次页面加载清掉自动刷新标记——这样下次重启（更新后）才能再次触发自动刷新
  useEffect(() => {
    try { sessionStorage.removeItem('dshp-auto-reloaded'); } catch { /* 忽略 */ }
  }, []);

  // 版本检测：host 当前版本 vs 本仓库 main 的 package.json（registry 带 CORS *）
  // 数据源必须是本 fork 自己的仓库：npm 上的 dsh-pocket 是**原版**（PIN 模型），
  // 拿它的版本号比较会诱导用户「更新」成另一个应用（README 曾专门警告）。
  // 本 fork 无 npm 发布、无 release tag，main 的 package.json.version 即版本真源，
  // 也与 github: 规格安装「pin 到 main 提交」的更新模型天然一致。
  // cache: 'no-store' —— raw 响应带缓存头，浏览器会缓存旧版本号导致「小版本不提示」
  // 周期重查（每 5 分钟）：raw 边缘缓存刚 push 后可能仍是旧版本号——周期性重查让
  // 更新提示在缓存刷新后自动出现，不用重开页面。
  // 桌面端（isDesktop）：更新/重启由 DSH Desktop 管理，这里不做版本检测、不显示更新横幅
  useEffect(() => {
    if (isDesktop) return;
    let alive = true;
    const check = async () => {
      try {
        const v = await call(POCKET_ENDPOINTS.version, {});
        if (!alive) return;
        if (v.installKind) setInstallKind(v.installKind);
        const meta = await (await fetch('https://raw.githubusercontent.com/cup113/dsh-pocket-oauth/main/package.json', { cache: 'no-store' })).json();
        if (!alive) return;
        const latest = typeof meta?.version === 'string' ? meta.version : null;
        if (latest && v.current && compareVersions(latest, v.current) > 0) {
          setUpdateInfo({ current: v.current, latest, updating: false, result: null, installKind: v.installKind ?? null });
        } else if (v.current && v.loaded && compareVersions(v.current, v.loaded) > 0) {
          // 已更新未重启：显示「已更新，重启生效」+ 重启按钮
          setUpdateInfo({ current: v.current, latest: v.current, updating: false, result: 'ok', updated: true, installKind: v.installKind ?? null });
        }
      } catch { /* 网络失败静默 */ }
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [isDesktop]);

  // 重启宿主（更新生效必需：刷新页面不会重载服务端代码）
  const restartPocket = async () => {
    setUpdateInfo((u) => ({ ...u, restarting: true, startedAt: Date.now() }));
    try {
      // 宿主 500ms 后自杀，RPC 响应可能来不及送达 → 3 秒超时兜底，别让按钮永远卡「重启中…」
      await Promise.race([
        call(POCKET_ENDPOINTS.restart, {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error('restart requested (no reply within 3s)')), 3000)),
      ]);
      setUpdateInfo((u) => ({ ...u, restarting: true, result: 'ok' }));
    } catch (err) {
      // 网络断连/超时同样视为「已请求重启」——旧进程即将退出，等新进程起来后刷新即可
      const msg = String(err?.message ?? '');
      if (/connection|socket|fetch|network|abort|cancelled|ECONN|disconnect|closed|timeout/i.test(msg)) {
        setUpdateInfo((u) => ({ ...u, restarting: true, result: 'ok' }));
        return;
      }
      setUpdateInfo((u) => ({ ...u, restarting: false, result: 'fail', output: err.message }));
    }
  };

  // 一键更新：按安装方式分发（source→git pull；github: 规格→重跑 add；失败给对应手动命令）
  const runUpdate = async () => {
    setUpdateInfo((u) => ({ ...u, updating: true, result: null, startedAt: Date.now(), installKind: u?.installKind ?? installKind }));
    try {
      const r = await call(POCKET_ENDPOINTS.update, {});
      setUpdateInfo((u) => ({
        ...u,
        updating: false,
        result: r.ok ? 'ok' : 'fail',
        autoRestart: r.autoRestart === true,
        output: r.output ?? r.error,
      }));
    } catch (err) {
      setUpdateInfo((u) => ({ ...u, updating: false, result: 'fail', output: err.message }));
    }
  };

  // 恢复出厂设置：清设置 + 清 OAuth 配置（弹窗确认；RPC 端也强制校验 confirm）
  const [resetOpen, setResetOpen] = useState(false);
  const doFactoryReset = async () => {
    setResetOpen(false);
    setBusy(true);
    setError(null);
    try {
      const next = await call(POCKET_ENDPOINTS.pocketReset, { confirm: true });
      setStatus(next);
      applyMobileRightbarSetting(next.mobileRightbarEnabled);
      showToast(t('resetDone'));
    } catch (err) {
      setError(err.message);
      showToast(t('resetFailed'));
    } finally {
      setBusy(false);
    }
  };

  const setMobileRightbar = async (on) => {
    try {
      const r = await call(POCKET_ENDPOINTS.mobileRightbarSetEnabled, { on });
      const enabled = r.mobileRightbarEnabled === true;
      setStatus((s) => ({ ...s, mobileRightbarEnabled: enabled }));
      applyMobileRightbarSetting(enabled);
    } catch (err) {
      setError(err.message);
    }
  };

  // OAuth 管理：登出所有设备（轮换会话密钥）/ 解除绑定（保留凭据，清 boundUid）
  const rotateSession = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(POCKET_ENDPOINTS.oauthRotateSession, {});
      showToast(t('rotatedDone'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const unbindOauth = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await call(POCKET_ENDPOINTS.oauthUnbind, {});
      setStatus((s) => ({ ...s, oauth: r.oauth ?? s?.oauth }));
      showToast(t('unbindDone'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // 后端错误消息统一为「中文 | English」混排；按当前界面语言只显示对应一半
  const errText = (msg) => {
    const s = String(msg ?? '');
    const i = s.indexOf(' | ');
    if (i < 0) return s;
    return (t('ok') === POCKET_ZH.ok ? s.slice(0, i) : s.slice(i + 3)).trim();
  };
  // 轻量 Toast：操作成功/失败后短暂提示（自动消失，不打断操作）
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // 通用确认弹框（登出所有设备 / 解除绑定共用）
  const [confirmState, setConfirmState] = useState(null); // { title, body, confirmLabel, danger, action } | null
  const openConfirm = (title, body, confirmLabel, danger, action) => setConfirmState({ title, body, confirmLabel, danger, action });
  const runConfirmed = async () => {
    const st = confirmState;
    setConfirmState(null);
    if (st?.action) await st.action();
  };

  // iOS 风格小开关（手机端右边栏）
  const Switch = (on, onClick) => h('button', {
    role: 'switch', 'aria-checked': !!on,
    style: { flexShrink: 0, width: 40, height: 22, borderRadius: 11, border: 'none', padding: 0, position: 'relative', cursor: 'pointer', font: 'inherit', background: on ? 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary,#4f6ef7))' : 'var(--dsw-alias-border-l2,#d1d5db)' },
    onClick,
  }, h('span', { style: { position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff' } }));
  // 卡片内主内容：二维码 + 地址 + 提示
  const qrArea = (src, url, hint) => h('div', { style: { background: 'var(--dsw-alias-bg-layer-2,#f3f4f6)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', margin: '10px 0' } },
    h('img', { src, alt: 'QR', style: styles.qr }),
    h('div', { style: styles.code }, url),
    h('div', { style: styles.muted }, hint));
  // 设置行：上分隔线，内部第一行 = 左标签 + 右操作；extra 作为第二段渲染
  const row = (label, control, extra) => h('div', { style: { borderTop: '1px solid var(--dsw-alias-border-l2,#e5e7eb)', paddingTop: 9, marginTop: 9 } },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
      h('span', { style: { fontSize: 13 } }, label), control), extra ?? null);

  // 访问地址分区：本机/局域网（同一网络，无需隧道）与公网（自建隧道/固定域名）——
  // 两类地址的使用前提完全不同，分开呈现并各配一句针对性提示；kind 缺失按 host 兜底。
  const originGroups = () => {
    const groups = { local: [], lan: [], public: [] };
    for (const o of status?.originQrs ?? []) {
      (groups[o.kind ?? fallbackKind(o.origin)] ?? groups.public).push(o);
    }
    const card = (o) => h('div', { key: o.origin },
      o.qr ? qrArea(o.qr, o.origin, fmt(t, 'qrHint', { provider: pLabel })) : h('div', { style: styles.code }, o.origin));
    const near = [...groups.local, ...groups.lan];
    return h('div', null,
      near.length > 0 ? h('div', { style: { marginTop: 6 } },
        h('div', { style: { fontWeight: 600, fontSize: 12 } }, t('originsGroupLocal')),
        h('div', { style: styles.muted }, t('originsGroupLocalHint')),
        near.map(card),
        lanCandidates.length > 0
          ? h('div', { style: { ...styles.muted, marginTop: 6 } }, fmt(t, 'lanCandidatesHint', { ips: lanCandidates.join('、') }))
          : null,
      ) : null,
      h('div', { style: { marginTop: near.length > 0 ? 10 : 6 } },
        h('div', { style: { fontWeight: 600, fontSize: 12 } }, t('originsGroupPublic')),
        groups.public.length > 0
          ? h('div', null,
              h('div', { style: styles.muted }, t('originsGroupPublicHint')),
              groups.public.map(card))
          : h('div', { style: styles.muted }, t('originsGroupPublicEmpty'))));
  };

  // 视图字段
  const proxyPort = status?.proxyPort ?? null;
  const setupUrl = proxyPort ? `http://127.0.0.1:${proxyPort}/pocket-setup` : 'http://127.0.0.1:3081/pocket-setup';
  const oauth = status?.oauth ?? { provider: 'gitee', configured: false, callbackOrigins: [], bound: false, boundLogin: null };
  // 当前鉴权方（Gitee / GitHub）：设置页文案与状态行据此显示
  const pLabel = providerLabel(oauth.provider);
  const lanCandidates = status?.lanCandidates ?? [];
  // 复制到剪贴板并 toast 反馈（共享 copyText：http://IP 非安全上下文走 execCommand 兜底，
  // 修复此前手机经局域网地址打开设置页时点「复制」静默失败的问题）
  const copyWithToast = async (text, doneKey = 'copied') => {
    const ok = await copyText(text);
    showToast(ok ? t(doneKey) : t('copyFailed'));
    return ok;
  };

  // 一键复制排障上下文：取最新 status/version 快照 → 组 markdown → 复制。
  // 供用户粘贴给外部 AI 接管排障（目标 + 架构/认证模型 + 状态 + 常见坑，已脱敏）。
  const copyTroubleshoot = async () => {
    try {
      const [s, v] = await Promise.all([
        call(POCKET_ENDPOINTS.status, {}),
        call(POCKET_ENDPOINTS.version, {}).catch(() => ({})),
      ]);
      const md = buildTroubleshootingContext(s, {
        version: v ?? {},
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      await copyWithToast(md, 'copyContextDone');
    } catch (err) {
      setError(err.message);
    }
  };

  return h('div', { style: styles.card },
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
      h('div', null,
        h('strong', null, t('title')),
        h('div', { style: styles.muted }, t('subtitle')),
      ),
      h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#8b93a1)', textAlign: 'right' } },
        h('div', { style: { whiteSpace: 'nowrap' } }, t('developer')),
        h('div', { style: { whiteSpace: 'nowrap' } }, t('derivedFrom')),
        h('div', { style: { whiteSpace: 'nowrap', marginTop: 2 } }, t('starAsk')),
        h('a', { href: 'https://github.com/cup113/dsh-pocket-oauth', target: '_blank', rel: 'noreferrer', style: { color: 'var(--dsw-alias-brand-primary,#4f6ef7)', fontSize: 12, lineHeight: 1.6, textDecoration: 'underline' } },
          t('starCta')),
        h('button', {
          type: 'button',
          title: t('copyContextHint'),
          style: { ...styles.btn, height: 26, padding: '0 10px', fontSize: 12, marginTop: 6 },
          onClick: copyTroubleshoot,
        }, t('copyContext')),
      ),
    ),

    // 桌面端不显示更新/重启横幅（更新由 DSH Desktop 管理），也不需要额外提示

    // 重启后提示（进程在后台运行，停止方法）——左侧蓝色色条（桌面端不会触发本插件的自重启）
    !isDesktop && restartNotice ? h('div', { style: { ...styles.block, borderLeft: '4px solid var(--dsw-alias-brand-primary,#4f6ef7)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2,#f3f4f6)', padding: '10px 12px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
        h('div', { style: { fontWeight: 600, fontSize: 13 } }, t('restarted')),
        h('button', { style: styles.btn, onClick: () => setRestartNotice(false) }, t('ok')),
      ),
      h('div', { style: styles.muted, marginTop: 4, wordBreak: 'break-all' }, fmt(t, 'bgHint', { cmd: status?.killHint ?? `lsof -ti :${status?.dshPort ?? 3080} | xargs kill -9` })),
    ) : null,

    // 更新提示——左侧黄色色条（提示有新版本）；单状态：有更新/更新中/已更新自动重启，不并存
    // 桌面端不渲染（更新由 DSH Desktop 管理）
    !isDesktop && updateInfo ? h('div', { style: { ...styles.block, borderLeft: '4px solid var(--dsw-alias-state-warn-primary,#b45309)', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2,#f3f4f6)', padding: '10px 12px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
        h('div', { style: { fontWeight: 600, fontSize: 13 } },
          updateInfo.updated
            ? fmt(t, 'updatedRestart', { ver: updateInfo.current })
            : updateInfo.result === 'ok'
              ? (updateInfo.autoRestart ? fmt(t, 'updateAutoRestarting', { ver: updateInfo.latest }) : fmt(t, 'updatedOk', { ver: updateInfo.latest }))
              : fmt(t, 'updateAvailable', { ver: updateInfo.latest })),
        updateInfo.result !== 'ok'
          ? h('button', { style: styles.primary, onClick: runUpdate, disabled: updateInfo.updating }, updateInfo.updating ? t('updating') : fmt(t, 'updateTo', { ver: updateInfo.latest }))
          : updateInfo.autoRestart
            ? h('button', { style: styles.btn, disabled: true }, t('restartingNow'))
            : h('button', { style: styles.primary, onClick: restartPocket, disabled: updateInfo.restarting }, updateInfo.restarting ? t('restarting') : t('restartNow')),
      ),
      h('div', { style: styles.muted, marginTop: 4 },
        updateInfo.updating
          ? fmt(t, 'updatingDetail', { s: elapsed(updateInfo.startedAt) })
        : updateInfo.restarting
          ? fmt(t, 'restartingDetail', { s: elapsed(updateInfo.startedAt) })
        : updateInfo.result === 'ok'
          ? (updateInfo.autoRestart ? t('updatedAutoDetail')
            : t('updatedRestartDetail'))
        : updateInfo.result === 'fail' ? fmt(t, 'updateFailed', { err: errText(updateInfo.output) || t('unknownError'), cmd: manualUpdateCmd(updateInfo.installKind ?? installKind) })
        : fmt(t, 'versionRange', { cur: updateInfo.current, latest: updateInfo.latest })),
    ) : null,

    // 远程访问（Gitee OAuth）：代理状态 + 初始化引导 + 绑定状态 + 地址二维码
    h('div', { style: styles.block },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        h('span', { style: { fontWeight: 600, fontSize: 13 } }, t('remoteAccess')),
        status?.proxyRunning
          ? h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary,#8b93a1)' } }, fmt(t, 'proxyReady', { port: proxyPort ?? '—' }))
          : h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-state-warn-primary,#b45309)' } }, t('proxyStarting')),
      ),

      // 初始化入口（本机）：随时可见（未配置时的核心引导；已配置时也可用来改配置/换绑）
      row(t('setupUrlLabel'),
        h('button', { style: { ...styles.btn, height: 26, padding: '0 10px', fontSize: 12 }, onClick: () => copyWithToast(setupUrl) }, t('copy')),
        h('div', { style: styles.code }, setupUrl)),

      // 状态分支
      !oauth.configured
        // ① 未初始化：三步引导（鉴权方二选一 → 国内/海外两条路径并列）
        ? h('div', { style: { marginTop: 8, fontSize: 12, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary,#6b7280)', background: 'var(--dsw-alias-bg-layer-2,#f3f4f6)', borderRadius: 10, padding: '10px 12px' } },
            h('div', { style: { fontWeight: 600, marginBottom: 4, color: 'var(--dsw-alias-label-primary,inherit)' } }, t('oauthGuideTitle')),
            fmt(t, 'oauthGuide1Gitee', { port: proxyPort ?? 3081 }),
            h('div', { style: { marginTop: 6 } }, fmt(t, 'oauthGuide1Github', { port: proxyPort ?? 3081 })),
            h('div', { style: { marginTop: 6 } }, t('oauthGuide2')),
            h('div', null, t('oauthGuide3')),
            h('div', { style: { ...styles.warn, marginTop: 6 } }, t('securityNote')))
        : !oauth.bound
          // ② 已存凭据未绑定：去 setup 完成绑定（文案按当前鉴权方）
          ? h('div', { style: { marginTop: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--dsw-alias-state-warn-primary,#b45309)' } },
              t('oauthUnbound'), h('br'), null, ' ', t('oauthUnboundHint'))
          // ③ 已绑定：当前鉴权方 + 账号 + 地址二维码 + 管理按钮
          : h('div', { style: { marginTop: 8 } },
              row(fmt(t, 'oauthState', { provider: pLabel }), h('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary,inherit)' } }, fmt(t, 'oauthBound', { login: oauth.boundLogin ?? '—' }))),
              oauth.callbackOrigins.length > 0
                ? originGroups()
                : null,
              h('div', { style: { marginTop: 10 } },
                h('button', { style: { ...styles.btn, height: 28, padding: '0 12px', fontSize: 12 }, disabled: busy, onClick: () => openConfirm(t('logoutAllTitle'), t('logoutAllBody'), t('logoutAll'), false, rotateSession) }, t('logoutAll')),
                h('button', { style: { ...styles.btn, height: 28, padding: '0 12px', fontSize: 12, marginLeft: 8, color: 'var(--dsw-alias-state-error-primary,#dc2626)' }, disabled: busy, onClick: () => openConfirm(t('unbindTitle'), t('unbindBody'), t('unbind'), true, unbindOauth) }, t('unbind'))),
              h('div', { style: { ...styles.warn, marginTop: 8 } }, t('securityNote')),
            ),
    ),

    h('div', { style: styles.block },
      row(
        t('mobileRightbar'),
        Switch(status?.mobileRightbarEnabled !== false, () => setMobileRightbar(status?.mobileRightbarEnabled === false)),
        h('div', { style: { ...styles.muted, marginTop: 6 } }, t('mobileRightbarHint')),
      ),
    ),

    error ? h('div', { style: { color: 'var(--dsw-alias-state-error-primary,#dc2626)', fontSize: 12, marginTop: 8 } }, `❌ ${errText(error)}`) : null,

    // 恢复出厂设置：设置出问题时的临时兜底（最底部，避免误触）
    h('div', { style: styles.block },
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
        h('span', { style: { fontWeight: 600, fontSize: 13 } }, t('resetFactory')),
        h('button', { style: { ...styles.btn, height: 28, padding: '0 12px', fontSize: 12, color: 'var(--dsw-alias-state-error-primary,#dc2626)' }, onClick: () => setResetOpen(true) }, t('resetGo')),
      ),
      h('div', { style: { ...styles.muted, marginTop: 6 } }, t('resetIntro')),
    ),

    // 恢复出厂设置确认弹框
    resetOpen ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } },
      h('div', { style: { background: 'var(--dsw-alias-bg-layer-1,#fff)', borderRadius: 12, maxWidth: 440, width: '100%', padding: '20px 22px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' } },
        h('div', { style: { fontWeight: 600, fontSize: 15, color: 'var(--dsw-alias-state-warn-primary,#b45309)', marginBottom: 10 } }, t('resetTitle')),
        h('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-primary,inherit)', whiteSpace: 'pre-line' } }, t('resetBody')),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
          h('button', { style: { ...styles.btn, flex: 1 }, onClick: () => setResetOpen(false) }, t('cancel')),
          h('button', { style: { ...styles.primary, flex: 1, background: 'var(--dsh-alias-state-error-primary,#dc2626)' }, onClick: doFactoryReset }, t('resetConfirm')),
        ),
      ),
    ) : null,

    // 通用确认弹框（登出所有设备 / 解除绑定）
    confirmState ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } },
      h('div', { style: { background: 'var(--dsw-alias-bg-layer-1,#fff)', borderRadius: 12, maxWidth: 420, width: '100%', padding: '20px 22px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' } },
        h('div', { style: { fontWeight: 600, fontSize: 15, color: confirmState.danger ? 'var(--dsw-alias-state-warn-primary,#b45309)' : 'var(--dsw-alias-brand-primary,#4f6ef7)', marginBottom: 10 } }, confirmState.title),
        h('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'var(--dsw-alias-label-primary,inherit)' } }, confirmState.body),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 16 } },
          h('button', { style: { ...styles.btn, flex: 1 }, onClick: () => setConfirmState(null) }, t('cancel')),
          h('button', { style: { ...styles.primary, flex: 1, ...(confirmState.danger ? { background: 'var(--dsh-alias-state-error-primary,#dc2626)' } : {}) }, onClick: runConfirmed }, confirmState.confirmLabel),
        ),
      ),
    ) : null,

    // Toast：操作反馈（固定屏幕正中央，2.6s 自动消失）
    toast ? h('div', {
      style: { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10001, width: 'auto', maxWidth: 280, background: 'rgba(17,24,39,.92)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, lineHeight: 1.5, textAlign: 'center', boxShadow: '0 8px 24px rgba(0,0,0,.22)' },
    }, toast) : null,

    // 页面最底部：反馈入口
    h('div', { style: { ...styles.block, textAlign: 'center' } },
      h('a', { href: 'https://github.com/cup113/dsh-pocket-oauth/issues', target: '_blank', rel: 'noreferrer', style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary,#6b7280)', textDecoration: 'none' } },
        t('feedback')),
    ),
  );
}

export function apply(ctx) {
  // 兜底：确保 connection.isLoopback 为 true（issue #58）。
  // 注：代理注入的 loopback 补丁（proxy.mjs LOOPBACK_ENV_PATCH）已在 #105 移除——
  // 它与 DSH Desktop 2.0.4+ 客户端运行时不兼容，会令 BootHandoff 阶段白屏。
  // #58「远程浏览器开设置页」需上游提供官方信任来源机制才能正经解决；此处仅保留兜底。
  if (ctx?.connection) {
    try {
      Object.defineProperty(ctx.connection, 'isLoopback', { value: true, writable: true, configurable: true });
    } catch {
      try { ctx.connection.isLoopback = true; } catch { /* 忽略 */ }
    }
  }

  // 移动端适配（dsh-web-mobile 移植）：抽屉布局/触控/安全区，仅窄屏生效
  mobileApply(ctx);

  const rpcCall = (endpoint, payload, signal) =>
    ctx.connection.rpc.call(POCKET_RPC_CHANNEL, endpoint, payload, signal);

  // 设置页签接入 DSH 本地化：注册 pocket 词典（zh/en），并绑定一个随当前 locale 切换的 t()。
  const translate = ctx.locale.bind(POCKET_NS);
  ctx.effect(() => ctx.locale.register(POCKET_NS, { zh: POCKET_ZH, en: POCKET_EN }), 'dsh-pocket: pocket locale dictionaries');

  // 设置一级入口（与 通用设置/模型/插件 同级，order 1 = 通用之后、最外层）
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'pocket',
        order: 1,
        label: () => translate('section'),
        inject: () => ({ rpcCall, t: translate }),
      },
      PocketSettingsTab,
    ),
  );
}

export { name, inject, redactStatus };
