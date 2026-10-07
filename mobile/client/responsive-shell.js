/**
 * dsh-pocket-mobile: 移动端视口检测、样式注入与抽屉式侧边栏控制器
 *
 * 四条不变量（本文件的存在理由）：
 *   1. 移动端断点必须与 DSH `ui-layout` 的 `SIDEBAR_AUTO_COLLAPSE`（1024）一致，
 *      否则 768–1023px 区间会出现「抽屉样式不生效 + 侧边栏只剩不可打开的图标条」。
 *   2. 抽屉开合**幂等**：`ctx.layout` 只暴露取反语义的 `toggleSidebar()`，
 *      因此必须先读框架自己维护的 `[data-sidebar-collapsed]` 再决定要不要调用。
 *   3. 汉堡按钮由 React 注册进 `conversation.header.leading`（见 index.jsx），
 *      本文件不再对 React 拥有的 header 做 DOM 注入。
 *   4. 自动收起只认「导航」，不认「点了哪一行」：工作区标题行本身就是展开/收起控件
 *      （`onToggle` 只改展开态、不打开会话），会话行的 `⋯` 按钮也一样自带
 *      stopPropagation。按行标记收起会让用户永远展不开工作区，因此这里改成两条：
 *      会话行被**激活**（且没落在行内控件上）→ 收起；主栏身份真的变了 → 收起。
 */

import { shellCss, settingsCss, composerCss, planCss, touchCss } from './styles.js';

/** 与 dsh-client-ui-layout 的 SIDEBAR_AUTO_COLLAPSE 对齐。 */
export const MOBILE_BREAKPOINT = 1024;

/** 移动端配置在 localStorage 中的键。 */
export const MOBILE_PREF_KEY = 'dsh_pocket_mobile_prefs';

/** 配置默认值。 */
export const DEFAULT_PREFS = Object.freeze({
  drawerBackdrop: true,
  compactComposer: true,
  stepSettings: true,
});

/** 抽屉里唯一「点它就是打开会话」的取点（dsh-client-ui-workspace 的会话行）。 */
export const SESSION_ROW_SELECTOR = '[data-row-key^="session:"]';

/**
 * 行内控件：落在它们身上不算「激活行」。
 * 会话行/工作区行里的 `⋯` 菜单按钮与行内按钮都自带 stopPropagation，
 * 也就是说「命中了行」不等于「行了」——必须把控件排除掉。
 */
export const ROW_CONTROL_SELECTOR =
  'button, a[href], input, textarea, select, [role="menuitem"], [role="button"], [role="tab"]';

/**
 * 会话行激活后延迟收起。
 * 必须晚于 React 自己的 click 处理：如果在此期间就把侧边栏切回收起态，
 * 行会在它自己的 `onOpen` 之前被卸载，会话反而打不开。
 */
export const ROW_CLOSE_DELAY_MS = 120;

/**
 * 两条自动收起路径（会话行激活 / 主栏身份变化）会为同一次点击几乎同时触发。
 * 框架的 `[data-sidebar-collapsed]` 要等 React 提交后才更新，若这一提交慢于
 * `ROW_CLOSE_DELAY_MS`，后到的那条就会以为「还开着」再调一次 toggle——
 * 而 `toggleSidebar()` 是取反语义，两次调用等于把抽屉又打开。
 * 因此两条路径合流到一个出口，在同一个「抽屉已展开」的窗口内只允许收起一次
 * （每次挂上身份观察器——也就是每次重新展开抽屉——都会重置这个窗口）。
 */
export const AUTO_CLOSE_DEDUPE_MS = 240;

/** 框架主栏列。 */
const CENTER_COL_SELECTOR = '.pI_x6G_centerCol';
/** 主栏 `main` 槽的锚点（display:contents，只在 DOM 里占位可寻址）。 */
export const MAIN_ANCHOR_SELECTOR = '[data-slot="main"]';
/** 会话根元素：恒在（空会话也渲染），但只有绑定了会话时才有下面的 id 属性。 */
export const CONVERSATION_MARKER_SELECTOR = '[data-conversation-content]';
/** 会话根携带的会话 id 属性。 */
export const CONVERSATION_SESSION_ATTR = 'data-conversation-session';

/** 当前生效的配置（模块级单例，供样式注入与设置适配器共享）。 */
let currentPrefs = { ...DEFAULT_PREFS };

/** @returns 当前生效配置的副本。 */
export function readMobilePrefs() {
  return { ...currentPrefs };
}

/**
 * 判断当前视口是否属于移动端触屏尺寸
 * @param {number} [width] 视口宽度，缺省取 window.innerWidth
 * @returns {boolean} 是否按移动端排版
 */
export function isMobileViewport(width = typeof window !== 'undefined' ? window.innerWidth : MOBILE_BREAKPOINT) {
  return width < MOBILE_BREAKPOINT;
}

/**
 * 按当前配置组合移动端 CSS。
 * 「输入框触屏与占位符完整显示」关闭时整段 composerCss 不注入——开关因此真实生效。
 * @param {object} [prefs] 配置
 * @returns {string} 待注入的样式文本
 */
export function mobileCss(prefs = currentPrefs) {
  return [
    shellCss,
    settingsCss,
    prefs.compactComposer === false ? '' : composerCss,
    planCss,
    touchCss,
  ].filter((part) => part !== '').join('\n\n');
}

/**
 * 集中组合并注入所有移动端 CSS 样式（重复调用只改写同一条 style 的内容）
 * @param {Document} [doc] 目标文档
 * @param {object} [prefs] 配置
 * @returns {() => void} 移除样式标签的清理函数
 */
export function injectMobileStyles(doc = document, prefs = currentPrefs) {
  const tagId = 'dsh-pocket-mobile/styles';
  let styleEl = doc.querySelector(`style[data-plugin-css="${tagId}"]`);
  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.dataset.plugin = 'dsh-pocket-mobile';
    styleEl.dataset.pluginCss = tagId;
    doc.head.appendChild(styleEl);
  }
  styleEl.textContent = mobileCss(prefs);

  return () => {
    styleEl?.remove();
  };
}

/**
 * 应用配置：刷新样式注入，并把「遮罩」开关投影成 <html> 上的属性供 CSS 门控。
 * @param {object} prefs 配置
 * @param {Document} [doc] 目标文档
 * @returns {object} 归一化后的生效配置
 */
export function applyMobilePrefs(prefs, doc = document) {
  currentPrefs = { ...DEFAULT_PREFS, ...(prefs ?? {}) };
  if (doc?.documentElement) {
    doc.documentElement.dataset.dshMobileBackdrop = currentPrefs.drawerBackdrop === false ? 'off' : 'on';
  }
  injectMobileStyles(doc, currentPrefs);
  return readMobilePrefs();
}

/**
 * @param {Document} [doc] 目标文档
 * @returns {Element|null} 三列框架元素
 */
export function drawerFrame(doc = document) {
  return doc.querySelector('.pI_x6G_frame');
}

/**
 * 抽屉是否处于收起态。框架未挂载时按收起处理。
 * @param {Document} [doc] 目标文档
 * @returns {boolean} 是否收起
 */
export function isDrawerCollapsed(doc = document) {
  const frame = drawerFrame(doc);
  return frame === null ? true : frame.hasAttribute('data-sidebar-collapsed');
}

/**
 * 幂等地把抽屉设为指定开合态：已经是目标态则不做任何事。
 * @param {object} ctx 插件上下文（用 ctx.layout.toggleSidebar）
 * @param {boolean} open 目标态
 * @param {Document} [doc] 目标文档
 * @returns {boolean} 是否真的调用了框架的 toggle
 */
export function setDrawerOpen(ctx, open, doc = document) {
  if (open === !isDrawerCollapsed(doc)) return false;
  const toggle = ctx?.layout?.toggleSidebar;
  if (typeof toggle !== 'function') return false;
  toggle.call(ctx.layout);
  return true;
}

/**
 * 打开抽屉（已打开则无操作）。
 * @param {object} ctx 插件上下文
 * @param {Document} [doc] 目标文档
 * @returns {boolean} 是否真的调用了框架的 toggle
 */
export function openDrawer(ctx, doc = document) {
  return setDrawerOpen(ctx, true, doc);
}

/**
 * 收起抽屉（已收起则无操作）。
 * @param {object} ctx 插件上下文
 * @param {Document} [doc] 目标文档
 * @returns {boolean} 是否真的调用了框架的 toggle
 */
export function closeDrawer(ctx, doc = document) {
  return setDrawerOpen(ctx, false, doc);
}

/**
 * 读出主栏当前的「身份」，用来判断一次交互有没有真的导航。
 * 身份只表示「主栏里是谁」：流式输出、滚动、开合卡片都不会改变它。
 * @param {Document} [doc] 目标文档
 * @returns {string} `conversation:<会话 id>` / `panel:<占据者 class>`；读不到时返回 ''
 */
export function mainViewIdentity(doc = document) {
  const center = doc?.querySelector?.(CENTER_COL_SELECTOR);
  if (!center || typeof center.querySelector !== 'function') return '';
  const conversation = center.querySelector(CONVERSATION_MARKER_SELECTOR);
  if (conversation) {
    const sessionId =
      typeof conversation.getAttribute === 'function'
        ? conversation.getAttribute(CONVERSATION_SESSION_ATTR)
        : null;
    return `conversation:${sessionId ?? ''}`;
  }
  const anchor = center.querySelector(MAIN_ANCHOR_SELECTOR);
  const occupant = anchor?.firstElementChild ?? null;
  if (occupant === null) return '';
  return `panel:${occupant.className ?? ''}`;
}

/**
 * 安装移动端响应式 Shell 适配器：
 * - 注入样式并跟随视口宽度维护 html[data-dsh-mobile]
 * - 管理抽屉遮罩的显隐与点击收起
 * - 自动收起只认「导航」：抽屉内激活会话行，或主栏身份真的变了
 * @param {object} ctx 插件上下文
 * @param {Document} [doc] 目标文档
 * @returns {() => void} 清理函数
 */
export function installResponsiveShell(ctx, doc = document) {
  if (typeof window === 'undefined') return () => {};

  // 1. 注入样式
  const cleanupStyles = injectMobileStyles(doc, currentPrefs);

  // 2. 插入或获取 Backdrop
  let backdrop = doc.getElementById('dsh-mobile-sidebar-backdrop');
  if (!backdrop) {
    backdrop = doc.createElement('div');
    backdrop.id = 'dsh-mobile-sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(backdrop);
  }

  // 点击遮罩收起抽屉
  const onBackdropClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDrawer(ctx, doc);
  };
  backdrop.addEventListener('click', onBackdropClick);

  // 3. 状态同步（rAF 合并：流式输出与动画期间 mutation 极其密集）
  let syncQueued = false;
  const requestSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    const run = () => {
      syncQueued = false;
      syncSidebarState();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else run();
  };

  // 4. 观察器收敛：AppFrame 还没挂载时用一个 rAF 合并的「等待器」盯 body，
  //    拿到帧的那一刻就换成只盯 [data-sidebar-collapsed] 的窄观察器。
  //    刻意不带 childList/subtree —— 对话流每追加一个 token 都会触发 childList，
  //    而遮罩只取决于框架自己维护的那一个属性。
  let frameObserver = null;
  let bootObserver = null;
  const ensureFrameObserver = () => {
    if (frameObserver !== null) return;
    const frame = drawerFrame(doc);
    if (frame === null) return;
    if (bootObserver !== null) {
      bootObserver.disconnect();
      bootObserver = null;
    }
    frameObserver = new MutationObserver(requestSync);
    frameObserver.observe(frame, {
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed'],
    });
  };

  // 5. 「导航即收起」的兜底一半：抽屉展开期间盯住主栏身份，只要它变了
  //    （开新会话 / 换会话 / 切全局面板）就收起抽屉。
  //    这样不必枚举抽屉里「哪些控件会导航」——展开工作区、开 ⋯ 菜单、展开更多会话
  //    都不改变主栏身份，因此不会被误收起；上游将来新增的导航入口也自动正确。
  //    观察器依旧很窄：只看主栏锚点的直接子节点 + 会话根那一个属性，不带 subtree，
  //    所以流式输出（每个 token 都改 DOM）不会触发它。
  let viewObserver = null;
  let viewBaseline = '';
  let viewSynced = false;
  let viewQueued = false;
  let lastAutoCloseAt = 0;

  /** 两条自动收起路径的唯一出口：同一次点击只允许收起一次（见 AUTO_CLOSE_DEDUPE_MS）。 */
  const requestAutoClose = () => {
    const now = Date.now();
    if (now - lastAutoCloseAt < AUTO_CLOSE_DEDUPE_MS) return;
    lastAutoCloseAt = now;
    closeDrawer(ctx, doc);
  };

  const viewTargets = () => {
    const center = doc.querySelector(CENTER_COL_SELECTOR);
    if (!center || typeof center.querySelector !== 'function') return null;
    return {
      anchor: center.querySelector(MAIN_ANCHOR_SELECTOR) ?? center,
      conversation: center.querySelector(CONVERSATION_MARKER_SELECTOR),
    };
  };

  const observeViewTargets = () => {
    const targets = viewTargets();
    if (targets === null || viewObserver === null) return;
    viewObserver.observe(targets.anchor, { childList: true });
    if (targets.conversation) {
      viewObserver.observe(targets.conversation, {
        attributes: true,
        attributeFilter: [CONVERSATION_SESSION_ATTR],
      });
    }
  };

  /** 主栏换人 / 会话根被替换后重新瞄准新节点，别继续盯着已脱离文档的元素。 */
  const retargetViewWatch = () => {
    if (viewObserver === null) return;
    viewObserver.disconnect();
    observeViewTargets();
  };

  const checkView = () => {
    const next = mainViewIdentity(doc);
    // 读不到主栏（框架未挂载）时不判定：宁可把抽屉留着，也不误收起
    if (next === '') return;
    if (!viewSynced) {
      // 抽屉展开时应用可能还在启动：第一次读到的身份就是基线
      viewSynced = true;
      viewBaseline = next;
      return;
    }
    if (next === viewBaseline) return;
    viewBaseline = next;
    requestAutoClose();
  };

  const requestViewCheck = () => {
    if (viewQueued) return;
    viewQueued = true;
    const run = () => {
      viewQueued = false;
      checkView();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else run();
  };

  const attachViewWatch = () => {
    if (viewObserver !== null) return;
    if (viewTargets() === null) return;
    viewObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList')) retargetViewWatch();
      requestViewCheck();
    });
    const initial = mainViewIdentity(doc);
    viewSynced = initial !== '';
    viewBaseline = initial;
    // 每次重新展开抽屉都是新的一次交互：去重窗口随之重置
    lastAutoCloseAt = 0;
    observeViewTargets();
  };

  const detachViewWatch = () => {
    viewObserver?.disconnect();
    viewObserver = null;
    viewBaseline = '';
    viewSynced = false;
  };

  const syncSidebarState = () => {
    ensureFrameObserver();
    if (!isMobileViewport(window.innerWidth)) {
      backdrop?.classList.remove('active');
      detachViewWatch();
      return;
    }
    const open = !isDrawerCollapsed(doc);
    backdrop?.classList.toggle('active', open);
    if (open) attachViewWatch();
    else detachViewWatch();
  };

  const updateMobileState = () => {
    if (isMobileViewport(window.innerWidth)) doc.documentElement.setAttribute('data-dsh-mobile', 'true');
    else doc.documentElement.removeAttribute('data-dsh-mobile');
    requestSync();
  };

  window.addEventListener('resize', updateMobileState);
  window.addEventListener('orientationchange', updateMobileState);

  if (drawerFrame(doc) === null && typeof MutationObserver === 'function') {
    bootObserver = new MutationObserver(requestSync);
    bootObserver.observe(doc.body, { childList: true, subtree: true });
  }

  // 6. 抽屉内「激活会话行」后自动收起：「导航即收起」的确定性一半（另一半见 checkView）。
  //    只认会话行 [data-row-key^="session:"]——会话行自己就是 onOpen。
  //    工作区标题行是展开/收起控件、`overflow:`/`empty` 是展开与筛选控件，都不在这里，
  //    它们的收起由「主栏身份真的变了」来兜底，所以用户可以安心点开工作区。
  const onDocumentClick = (e) => {
    if (!isMobileViewport(window.innerWidth)) return;
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    if (isDrawerCollapsed(doc)) return;
    if (target.closest('.pI_x6G_sidebarCol') === null) return;
    if (target.closest(SESSION_ROW_SELECTOR) === null) return;
    // ⋯ 菜单等行内控件自带 stopPropagation，点它们不会打开会话，也就不算激活行
    if (target.closest(ROW_CONTROL_SELECTOR) !== null) return;
    setTimeout(() => {
      if (!isDrawerCollapsed(doc)) requestAutoClose();
    }, ROW_CLOSE_DELAY_MS);
  };
  doc.addEventListener('click', onDocumentClick, true);

  updateMobileState();
  syncSidebarState();

  return () => {
    window.removeEventListener('resize', updateMobileState);
    window.removeEventListener('orientationchange', updateMobileState);
    backdrop?.removeEventListener('click', onBackdropClick);
    backdrop?.remove();
    doc.removeEventListener('click', onDocumentClick, true);
    bootObserver?.disconnect();
    frameObserver?.disconnect();
    detachViewWatch();
    syncQueued = false;
    viewQueued = false;
    cleanupStyles();
    doc.documentElement.removeAttribute('data-dsh-mobile');
    delete doc.documentElement.dataset.dshMobileBackdrop;
  };
}
