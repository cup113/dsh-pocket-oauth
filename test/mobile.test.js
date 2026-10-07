// 移动端 WebUI 组件专项测试：
//   - 视口断点（必须与 dsh-client-ui-layout 的 SIDEBAR_AUTO_COLLAPSE 对齐）
//   - 移动端样式表与 DSH 真实 DOM 契约的对齐 + 旧错误选择器的回归防护
//   - 抽屉开合的幂等性（ctx.layout 只提供取反语义的 toggleSidebar）
//   - 自动收起只认「导航」：展开工作区、开菜单不得关掉抽屉
//   - 配置开关真实落地
//   - 客户端 bundle 结构与契约导出

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONVERSATION_MARKER_SELECTOR,
  CONVERSATION_SESSION_ATTR,
  DEFAULT_PREFS,
  MAIN_ANCHOR_SELECTOR,
  MOBILE_BREAKPOINT,
  ROW_CLOSE_DELAY_MS,
  ROW_CONTROL_SELECTOR,
  applyMobilePrefs,
  closeDrawer,
  installResponsiveShell,
  isDrawerCollapsed,
  isMobileViewport,
  mainViewIdentity,
  mobileCss,
  openDrawer,
  readMobilePrefs,
} from '../mobile/client/responsive-shell.js';
import { installSettingsAdapter } from '../mobile/client/settings-adapter.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = readFileSync(join(root, 'mobile', 'client', 'client.js'), 'utf8');

/** 取出 `选择器 { … }` 规则体，用于对单条规则做断言。 */
function ruleBody(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `CSS 中未找到规则 ${selector}`);
  const end = css.indexOf('}', start);
  assert.ok(end > start, `规则 ${selector} 未闭合`);
  return css.slice(start, end);
}

// ── 视口断点 ────────────────────────────────────────────────────────────────

test('移动端视口判定：与 SIDEBAR_AUTO_COLLAPSE 同断点（1024）', () => {
  assert.equal(MOBILE_BREAKPOINT, 1024, '必须与 dsh-client-ui-layout 的 SIDEBAR_AUTO_COLLAPSE 一致');
  assert.equal(isMobileViewport(320), true, 'iPhone SE 宽度');
  assert.equal(isMobileViewport(390), true, 'iPhone 13 / 14 宽度');
  assert.equal(isMobileViewport(430), true, 'iPhone Pro Max 宽度');
  assert.equal(isMobileViewport(767), true, '旧断点下界仍属移动端');
  assert.equal(isMobileViewport(768), true, 'iPad 竖屏：框架仍然折叠侧边栏，必须走抽屉');
  assert.equal(isMobileViewport(844), true, '手机横屏（框架仍折叠侧边栏）');
  assert.equal(isMobileViewport(1023), true, '断点上界');
  assert.equal(isMobileViewport(1024), false, '桌面三栏起算点');
  assert.equal(isMobileViewport(1440), false, '宽屏显示器');
});

test('CSS 断点与 MOBILE_BREAKPOINT 对齐：移动端 1023 / 桌面 1024', () => {
  const css = mobileCss();
  assert.ok(css.includes('@media (max-width: 1023px)'), '移动端 media 必须用 1023px');
  assert.ok(!css.includes('@media (max-width: 767px)'), '残留的旧 767px 断点会让 768–1023 失去抽屉能力');
  assert.ok(css.includes('@media (min-width: 1024px)'), '桌面隐藏移动端控件的 media 必须用 1024px');
});

// ── 与 DSH 真实 DOM 契约对齐 ────────────────────────────────────────────────

test('核心框架：按 AppFrame 的真实类名布局，保留 grid 高度链', () => {
  const css = mobileCss();

  // 三列 + 手柄都是 CSS-module 类名，[data-column=…] 之类的属性从未存在过
  for (const selector of [
    '.pI_x6G_frame {',
    '.pI_x6G_centerCol {',
    '.pI_x6G_sidebarCol {',
    '.pI_x6G_rightbarCol {',
    '.pI_x6G_handle {',
    '.pI_x6G_overlayLayer {',
    '.wSkVaW_widthHandle {',
  ]) {
    assert.ok(css.includes(selector), `缺少与真实 DOM 对齐的规则 ${selector}`);
  }

  // 必须保留 grid：centerCol 的高度只来自 grid-template-rows:100%
  const frame = ruleBody(css, '.pI_x6G_frame');
  assert.ok(frame.includes('display: grid !important'), '根框架必须保持 grid（block 会让 centerCol 塌成 height:auto）');
  assert.ok(!frame.includes('display: block'), '根框架不得改成 block');
  assert.ok(frame.includes('grid-template-columns: 100% !important'), '收敛为单列');
  assert.ok(!css.includes('will-change: transform'), '抽屉不得声明 will-change：它会建立包含块破坏内部 fixed 定位');

  // 抽屉收起态只由 [data-sidebar-collapsed] 一个属性表达
  assert.ok(
    css.includes('.pI_x6G_frame[data-sidebar-collapsed] > .pI_x6G_sidebarCol'),
    '收起态必须由 [data-sidebar-collapsed] 驱动',
  );
  assert.ok(css.includes('translateX(-105%)'), '抽屉折叠时完全移出屏幕');

  // 右侧栏轨道压成 0 宽，避免全屏盒子吃掉对话区的点击
  const rightbar = ruleBody(css, '.pI_x6G_rightbarCol');
  assert.ok(rightbar.includes('width: 0 !important'), '右侧栏轨道必须为 0 宽');
  assert.ok(!rightbar.includes('100vw'), '右侧栏轨道不得占满视口');
});

test('回归防护：旧错误选择器与死钩子不得回潮', () => {
  const css = mobileCss();
  for (const banned of [
    '[data-column="center"]',
    '[data-column="sidebar"]',
    'div:nth-child(3)',
    'div:first-child',
    'data-sidebar-expanded',
    '[data-command-menu-root]',
    '[data-conversation-region="header"]',
    '.VOzbGW_body',
  ]) {
    assert.ok(!css.includes(banned), `CSS 中残留了无效/危险选择器 ${banned}`);
  }
  // 设置面板的真实结构类名
  assert.ok(css.includes('.VOzbGW_content'), '设置面板内容容器是 .VOzbGW_content');
  // 快捷指令菜单的真实钩子
  assert.ok(css.includes('[data-trigger-menu]'), '指令菜单的真实钩子是 data-trigger-menu');
});

test('移动端样式规则完整性：覆盖关键痛点选择器', () => {
  // 1. 抽屉侧边栏
  assert.ok(bundle.includes('.pI_x6G_frame'), '覆盖 AppFrame 网格');
  assert.ok(bundle.includes('#dsh-mobile-sidebar-backdrop'), '包含抽屉半透明毛玻璃遮罩');
  assert.ok(bundle.includes('#dsh-mobile-drawer-toggle'), '包含移动端汉堡菜单触发按钮');

  // 2. 设置弹窗两级导航与流式排版
  assert.ok(bundle.includes('.VOzbGW_panel'), '覆盖设置弹窗外层面板');
  assert.ok(bundle.includes('data-mobile-settings-view'), '包含移动端设置两级视图状态属性');
  assert.ok(bundle.includes('.dsh-mobile-settings-back-bar'), '包含移动端详情返回按钮栏');
  assert.ok(bundle.includes('word-break: break-word'), '包含选项文字自适应防竖向折行');

  // 3. 输入框与底部操作栏
  assert.ok(bundle.includes('.uV2eYG_placeholder'), '覆盖 Composer 占位符样式');
  assert.ok(bundle.includes('-webkit-line-clamp: 2'), '占位符允许多行折行自适应');
  assert.ok(bundle.includes('._7KE1Ra_trigger'), '包含模型选择器紧凑触控尺寸');
  assert.ok(bundle.includes('._7KE1Ra_menu'), '包含模型选择下拉底部浮层');
  assert.ok(bundle.includes('#dsh-mobile-panel-exit'), '包含全局面板（插件 / 定时任务）的返回会话键');
  assert.ok(bundle.includes('html[data-dsh-mobile-panel]'), '面板态给返回键让出顶部一行');

  // 4. Plan 待审卡片与审批卡片
  assert.ok(bundle.includes('.LVzXQa_card'), '包含 PlanReviewPanel 移动端卡片样式');
  assert.ok(bundle.includes('.Mbwy4a_card'), '包含 QuestionComposer 移动端卡片样式');
  assert.ok(bundle.includes('.mna1RW_card'), '包含 ApprovalPanel 移动端卡片样式');
  assert.ok(bundle.includes('.k74WwW_card'), '包含 PlanCard 产物卡片样式');
});

// ── 抽屉开合的幂等性 ────────────────────────────────────────────────────────

/** 造一个只响应 [data-sidebar-collapsed] 的假文档。 */
function fakeDoc(collapsed) {
  const frame = collapsed === null ? null : {
    hasAttribute: (name) => collapsed === true && name === 'data-sidebar-collapsed',
  };
  return { querySelector: () => frame };
}

/** 造一个记录调用次数的假 ctx。onToggle 用来模拟真实框架翻转 [data-sidebar-collapsed]。 */
function fakeCtx({ onToggle } = {}) {
  const calls = { toggle: 0 };
  return {
    calls,
    ctx: {
      layout: {
        toggleSidebar() {
          calls.toggle += 1;
          onToggle?.();
        },
      },
    },
  };
}

test('抽屉控制：已经是目标态时绝不调用 toggle（toggleSidebar 是取反语义）', () => {
  const collapsed1 = fakeCtx();
  assert.equal(openDrawer(collapsed1.ctx, fakeDoc(true)), true, '收起点「打开」必须调用一次');
  assert.equal(collapsed1.calls.toggle, 1);

  const collapsed2 = fakeCtx();
  assert.equal(closeDrawer(collapsed2.ctx, fakeDoc(true)), false, '已经是收起态，再点「收起」不得调用（否则会反转成打开）');
  assert.equal(collapsed2.calls.toggle, 0);

  const expanded1 = fakeCtx();
  assert.equal(closeDrawer(expanded1.ctx, fakeDoc(false)), true, '展开点「收起」必须调用一次');
  assert.equal(expanded1.calls.toggle, 1);

  const expanded2 = fakeCtx();
  assert.equal(openDrawer(expanded2.ctx, fakeDoc(false)), false, '已经是展开态，再点「打开」不得调用');
  assert.equal(expanded2.calls.toggle, 0);
});

test('抽屉控制：框架未挂载按收起处理，缺少 layout 服务时安全退让', () => {
  const un = fakeCtx();
  assert.equal(isDrawerCollapsed(fakeDoc(null)), true, '框架未挂载按收起处理');
  assert.equal(openDrawer(un.ctx, fakeDoc(null)), true, '框架未挂载时点打开应请求框架 toggle');
  assert.equal(closeDrawer(un.ctx, fakeDoc(null)), false, '框架未挂载时点收起应无操作');

  const noService = { calls: { toggle: 0 } };
  assert.equal(openDrawer({}, fakeDoc(true)), false, '没有 ctx.layout 时不得抛错');
  assert.equal(openDrawer(undefined, fakeDoc(true)), false, 'ctx 为空时不得抛错');
  assert.equal(noService.calls.toggle, 0);
});

// ── 配置开关真实落地 ────────────────────────────────────────────────────────

/** 造一个足够 applyMobilePrefs 使用的假文档。 */
function styleFixture() {
  const styleEl = { dataset: {}, textContent: '', remove() {} };
  const doc = {
    documentElement: { dataset: {} },
    querySelector: () => styleEl,
    createElement: () => styleEl,
    head: { appendChild() {} },
  };
  return { doc, styleEl };
}

test('开关「输入框触屏」：关闭时整段 composerCss 不再注入', () => {
  const on = mobileCss({ ...DEFAULT_PREFS, compactComposer: true });
  assert.ok(on.includes('[data-trigger-menu]'), '开启时应注入输入框样式');

  const off = mobileCss({ ...DEFAULT_PREFS, compactComposer: false });
  assert.ok(!off.includes('[data-trigger-menu]'), '关闭时不得注入输入框样式');
  assert.ok(off.includes('.uV2eYG_row') === false, '关闭时不得残留输入框样式');
  assert.ok(off.includes('.pI_x6G_frame'), '关闭输入框样式不影响核心框架样式');
  assert.ok(off.includes('.LVzXQa_card'), '关闭输入框样式不影响 Plan 卡片样式');
});

test('开关「遮罩」：投影成 html 属性并刷新样式注入', () => {
  const a = styleFixture();
  applyMobilePrefs({ ...DEFAULT_PREFS, drawerBackdrop: false }, a.doc);
  assert.equal(a.doc.documentElement.dataset.dshMobileBackdrop, 'off', '关闭遮罩要投影成 off');
  assert.ok(a.styleEl.textContent.includes('html[data-dsh-mobile-backdrop="off"]'), 'CSS 必须带遮罩门控规则');

  const b = styleFixture();
  applyMobilePrefs({ ...DEFAULT_PREFS, drawerBackdrop: true, compactComposer: false }, b.doc);
  assert.equal(b.doc.documentElement.dataset.dshMobileBackdrop, 'on', '开启遮罩要投影成 on');

  // 复位模块级配置，避免污染后续测试
  applyMobilePrefs(DEFAULT_PREFS, styleFixture().doc);
  assert.deepEqual(readMobilePrefs(), { ...DEFAULT_PREFS }, '配置复位');
});

// ── 安装/卸载生命周期（遮罩不能卡成全屏点击陷阱） ──────────────────────────

/** 极简假 window：记录监听器、立即执行 rAF。 */
function fakeWindow(width) {
  const listeners = new Map();
  return {
    innerWidth: width,
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    requestAnimationFrame(fn) {
      fn();
      return 1;
    },
  };
}

/** 假 MutationObserver：记录观察目标与选项，便于断言「观察器是否收敛」。 */
class FakeMutationObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.options = [];
    this.disconnected = false;
    FakeMutationObserver.instances.push(this);
  }

  observe(target, options) {
    this.targets.push(target);
    this.options.push(options);
  }

  disconnect() {
    this.disconnected = true;
    this.targets = [];
  }
}

/** 假 classList。 */
function fakeClassList() {
  const classes = new Set();
  return {
    classes,
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    contains: (name) => classes.has(name),
  };
}

/** 造一套足够 installResponsiveShell 使用的假文档。frameRef 让帧「稍后挂载」。 */
function installFixture({ collapsed, frameRef = null }) {
  const created = [];
  const frame = {
    hasAttribute: (name) => collapsed && name === 'data-sidebar-collapsed',
    observedAttributes: [],
  };
  const styleEl = { dataset: {}, textContent: '', removed: false, remove() { this.removed = true; } };
  const backdrop = {
    id: '',
    dataset: {},
    classList: fakeClassList(),
    removed: false,
    handlers: {},
    setAttribute() {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    removeEventListener(type) { delete this.handlers[type]; },
    remove() { this.removed = true; },
  };
  const doc = {
    documentElement: {
      dataset: {},
      attributes: new Set(),
      setAttribute(name) { this.attributes.add(name); },
      removeAttribute(name) { this.attributes.delete(name); },
    },
    body: { children: [], appendChild(node) { this.children.push(node); } },
    head: { appendChild() {} },
    handlers: {},
    getElementById: () => null,
    querySelector: (selector) => (selector === '.pI_x6G_frame' ? (frameRef ? frameRef.current : frame) : styleEl),
    createElement: (tag) => {
      created.push(tag);
      return backdrop;
    },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    removeEventListener(type) { delete this.handlers[type]; },
  };
  return { doc, frame, backdrop, styleEl, created };
}

test('安装/卸载：遮罩只在抽屉展开时激活，卸载后彻底清理', async () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  try {
    // 收起态：遮罩不得激活，点遮罩不得把抽屉「反开」
    const collapsed = installFixture({ collapsed: true });
    const closedCtx = fakeCtx();
    const disposeClosed = installResponsiveShell(closedCtx.ctx, collapsed.doc);
    assert.ok(collapsed.styleEl.textContent.includes('.pI_x6G_frame'), '安装时注入样式');
    assert.equal(collapsed.backdrop.classList.contains('active'), false, '收起态遮罩不得激活');
    assert.ok(collapsed.doc.documentElement.attributes.has('data-dsh-mobile'), '移动端标记写入 <html>');
    collapsed.backdrop.handlers.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(closedCtx.calls.toggle, 0, '收起态点遮罩不得调用 toggle（否则会反转成打开）');
    disposeClosed();
    assert.equal(collapsed.backdrop.removed, true, '卸载移除遮罩');
    assert.equal(collapsed.styleEl.removed, true, '卸载移除样式');
    assert.equal(collapsed.doc.handlers.click, undefined, '卸载移除文档点击监听');

    // 展开态：遮罩激活，点遮罩收起抽屉（恰好一次）
    const expanded = installFixture({ collapsed: false });
    const openCtx = fakeCtx();
    const disposeOpen = installResponsiveShell(openCtx.ctx, expanded.doc);
    assert.equal(expanded.backdrop.classList.contains('active'), true, '展开态遮罩必须激活');
    expanded.backdrop.handlers.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(openCtx.calls.toggle, 1, '展开态点遮罩收起抽屉');

    // 抽屉内点会话行 → 自动收起；点普通按钮 → 不收起
    const inSidebar = (isRow) => ({
      closest(selector) {
        if (selector.includes('.pI_x6G_sidebarCol')) return {};
        if (selector.includes('data-row-key')) return isRow ? {} : null;
        return null;
      },
    });
    expanded.doc.handlers.click({ target: inSidebar(false) });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(openCtx.calls.toggle, 1, '抽屉内点普通按钮不得收起抽屉');

    expanded.doc.handlers.click({ target: inSidebar(true) });
    await new Promise((resolve) => setTimeout(resolve, 160));
    assert.equal(openCtx.calls.toggle, 2, '抽屉内点会话/工作区行应收起抽屉');

    // 桌面宽度：遮罩保持不激活
    globalThis.window = fakeWindow(1440);
    const desktop = installFixture({ collapsed: false });
    const desktopCtx = fakeCtx();
    const disposeDesktop = installResponsiveShell(desktopCtx.ctx, desktop.doc);
    assert.equal(desktop.backdrop.classList.contains('active'), false, '桌面宽度不得激活遮罩');
    assert.equal(desktop.doc.documentElement.attributes.has('data-dsh-mobile'), false, '桌面宽度不得写移动端标记');
    disposeDesktop();
    disposeOpen();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

// ── 自动收起只认「导航」：点工作区行不得关掉抽屉 ────────────────────────────

/**
 * 造一套带「主栏身份」的假文档：抽屉开合、会话↔面板切换都能被驱动。
 * 结构对齐真实契约：.pI_x6G_centerCol > [data-slot="main"] >（会话根 | 面板根）。
 */
function viewFixture({ collapsed = false, conversation = true, sessionId = 's1' } = {}) {
  const state = {
    collapsed,
    conversation,
    sessionId,
    occupant: { className: 'PluginRoot_hash' },
  };
  const frame = { hasAttribute: (name) => state.collapsed && name === 'data-sidebar-collapsed' };
  const conversationNode = {
    getAttribute: (name) => (name === CONVERSATION_SESSION_ATTR ? state.sessionId : null),
  };
  const anchor = {
    get firstElementChild() {
      return state.occupant;
    },
  };
  const center = {
    querySelector: (selector) => {
      if (selector === CONVERSATION_MARKER_SELECTOR) return state.conversation ? conversationNode : null;
      if (selector === MAIN_ANCHOR_SELECTOR) return anchor;
      return null;
    },
  };
  const styleEl = { dataset: {}, textContent: '', remove() {} };
  const backdrop = {
    id: '',
    dataset: {},
    classList: fakeClassList(),
    handlers: {},
    setAttribute() {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    removeEventListener(type) { delete this.handlers[type]; },
    remove() {},
  };
  const doc = {
    documentElement: { dataset: {}, setAttribute() {}, removeAttribute() {} },
    body: { appendChild() {} },
    head: { appendChild() {} },
    handlers: {},
    getElementById: () => null,
    querySelector: (selector) =>
      selector === '.pI_x6G_frame' ? frame : selector === '.pI_x6G_centerCol' ? center : styleEl,
    createElement: (tag) => (tag === 'style' ? styleEl : backdrop),
    addEventListener(type, fn) { this.handlers[type] = fn; },
    removeEventListener(type) { delete this.handlers[type]; },
  };
  return { doc, frame, center, anchor, conversationNode, backdrop, styleEl, state };
}

/**
 * 假点击目标：按「选择器列表」语义回答 closest——命中任一子选择器即算命中。
 * 行标记与按钮全部用 DOM 字面量建模，不引用被测常量，否则回归护栏会自我实现。
 */
function clickTarget({ inSidebar = true, sessionRow = false, workspaceRow = false, control = false } = {}) {
  return {
    closest(selector) {
      if (selector.includes('.pI_x6G_sidebarCol')) return inSidebar ? {} : null;
      let hit = false;
      if (selector.includes('data-row-key^="session:"')) hit = hit || sessionRow;
      if (selector.includes('data-row-key^="workspace:"')) hit = hit || workspaceRow;
      if (selector.includes('button')) hit = hit || control;
      return hit ? {} : null;
    },
  };
}

test('主栏身份：会话 / 面板 / 读不到三种取值', () => {
  const center = ({ conversation = null, occupant = null } = {}) => ({
    querySelector: (selector) =>
      selector === CONVERSATION_MARKER_SELECTOR
        ? conversation
        : selector === MAIN_ANCHOR_SELECTOR && occupant !== null
          ? { firstElementChild: occupant }
          : null,
  });
  const withCenter = (node) => ({
    querySelector: (selector) => (selector === '.pI_x6G_centerCol' ? node : null),
  });

  assert.equal(
    mainViewIdentity(withCenter(center({ conversation: { getAttribute: () => 's1' } }))),
    'conversation:s1',
    '主栏是会话时身份带会话 id',
  );
  assert.equal(
    mainViewIdentity(withCenter(center({ conversation: { getAttribute: () => null } }))),
    'conversation:',
    '空会话（hero）没有会话 id 属性，但仍是会话',
  );
  assert.equal(
    mainViewIdentity(withCenter(center({ occupant: { className: 'PluginRoot_hash' } }))),
    'panel:PluginRoot_hash',
    '主栏被全局面板占据时按面板类名区分',
  );
  assert.equal(mainViewIdentity(withCenter(center())), '', '主栏空无一物时读不到');
  assert.equal(mainViewIdentity(withCenter(null)), '', '没有主栏列时读不到');
  assert.equal(mainViewIdentity({ querySelector: () => ({}) }), '', '主栏不是元素时读不到');
  assert.equal(mainViewIdentity({}), '', '空文档不得抛错');
  assert.equal(
    mainViewIdentity(withCenter(center({ conversation: {} }))),
    'conversation:',
    '会话根缺 getAttribute 时按空会话处理，不得抛错',
  );
  assert.ok(ROW_CONTROL_SELECTOR.includes('button'), '行内控件至少要覆盖 button');
});

test('回归防护：点工作区行不得收起抽屉（它只是展开/收起控件）', async () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  try {
    const f = viewFixture({ collapsed: false });
    const { ctx, calls } = fakeCtx();
    const dispose = installResponsiveShell(ctx, f.doc);
    const click = (options) => f.doc.handlers.click({ target: clickTarget(options) });
    const settle = () => new Promise((resolve) => setTimeout(resolve, ROW_CLOSE_DELAY_MS + 40));

    click({ workspaceRow: true });
    await settle();
    assert.equal(calls.toggle, 0, '工作区行是「展开工作区」的唯一入口，收起抽屉会让用户永远展不开');

    click({ workspaceRow: true, control: true });
    await settle();
    assert.equal(calls.toggle, 0, '工作区行里的 + 按钮也不走会话行路径（它由主栏身份兜底）');

    click({ inSidebar: false, sessionRow: true });
    await settle();
    assert.equal(calls.toggle, 0, '抽屉之外的同名行不受影响');

    click({ sessionRow: true, control: true });
    await settle();
    assert.equal(calls.toggle, 0, '会话行的 ⋯ 菜单自带 stopPropagation，不算「激活行」');

    click({ sessionRow: true });
    await settle();
    assert.equal(calls.toggle, 1, '会话行才是「打开会话」：必须收起，且恰好一次');

    dispose();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

test('导航即收起：只看主栏锚点与会话 id，且只在抽屉展开时存在', async () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  try {
    const f = viewFixture({ collapsed: false });
    // 真实框架：toggleSidebar() 会翻转帧上的 [data-sidebar-collapsed]，我们的窄观察器随即同步
    const { ctx, calls } = fakeCtx({
      onToggle: () => {
        f.state.collapsed = !f.state.collapsed;
        FakeMutationObserver.instances[0].callback();
      },
    });
    const dispose = installResponsiveShell(ctx, f.doc);

    const frameObserver = FakeMutationObserver.instances[0];
    const view = FakeMutationObserver.instances[1];
    assert.equal(FakeMutationObserver.instances.length, 2, '展开态：帧观察器 + 主栏身份观察器');
    assert.equal(view.targets[0], f.anchor, '盯主栏锚点');
    assert.equal(view.options[0].childList, true, '锚点只看直接子节点增删');
    assert.equal(view.options[0].subtree, undefined, '不得带 subtree：流式输出每个 token 都会触发');
    assert.equal(view.targets[1], f.conversationNode, '同时盯会话根本身');
    assert.deepEqual(view.options[1].attributeFilter, [CONVERSATION_SESSION_ATTR], '只过滤会话 id 属性');
    assert.equal(view.options[1].childList, undefined, '会话根只看属性，不看子节点');

    // 身份没变：展开工作区、开菜单、翻看历史都不该收起抽屉
    view.callback([{ type: 'childList' }]);
    assert.equal(calls.toggle, 0, '主栏身份未变时不得收起抽屉');
    assert.equal(view.targets.length, 2, '锚点 childList 只重定向，不该丢目标');

    // 身份变了：换会话 → 收起，并由框架属性驱动摘掉观察器
    f.state.sessionId = 's2';
    view.callback([{ type: 'attributes' }]);
    assert.equal(calls.toggle, 1, '主栏换了会话必须收起抽屉');
    assert.equal(view.targets.length, 0, '抽屉收起后必须摘掉身份观察器，不再空转');

    // 同一次点击的第二条路径（延迟的会话行收起）不得再 toggle 一次，否则抽屉会被重新打开
    f.doc.handlers.click({ target: clickTarget({ sessionRow: true }) });
    await new Promise((resolve) => setTimeout(resolve, ROW_CLOSE_DELAY_MS + 40));
    assert.equal(calls.toggle, 1, '同一次点击的两条自动路径只允许收起一次');

    // 重新展开 → 重新挂上，并以当时的身份为新基线
    f.state.collapsed = false;
    frameObserver.callback();
    const view2 = FakeMutationObserver.instances[2];
    assert.equal(view2.targets.length, 2, '重新展开必须重新挂上观察器');
    view2.callback([{ type: 'attributes' }]);
    assert.equal(calls.toggle, 1, '重挂后的第一眼只是基线，不得误收起');

    // 切全局面板：会话根消失，也算导航
    f.state.conversation = false;
    view2.callback([{ type: 'childList' }]);
    assert.equal(calls.toggle, 2, '切到全局面板也算导航');

    // 再展开一次，验证桌面宽度分支会摘掉观察器
    f.state.collapsed = false;
    frameObserver.callback();
    const view3 = FakeMutationObserver.instances[3];
    assert.equal(view3.targets.length, 1, '会话根消失后只盯锚点');
    globalThis.window = fakeWindow(1440);
    frameObserver.callback();
    assert.equal(view3.targets.length, 0, '桌面宽度必须摘掉身份观察器');

    dispose();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

test('导航即收起：展开时读不到主栏就只记基线，不误收起', () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  try {
    // 抽屉展开时应用还在启动：主栏里什么都没有
    const f = viewFixture({ collapsed: false, conversation: false });
    f.state.occupant = null;
    const { ctx, calls } = fakeCtx();
    const dispose = installResponsiveShell(ctx, f.doc);
    const view = FakeMutationObserver.instances[1];
    assert.equal(mainViewIdentity(f.doc), '', '此刻读不到主栏');
    assert.equal(view.targets.length, 1, '读不到会话根时只盯锚点');

    // 应用启动完成，主栏出现空会话（hero）：只记基线
    f.state.conversation = true;
    f.state.sessionId = null;
    view.callback([{ type: 'childList' }]);
    assert.equal(calls.toggle, 0, '启动期间第一次读到主栏不得收起抽屉');

    // 之后真的导航，仍然收起
    f.state.sessionId = 's9';
    view.callback([{ type: 'attributes' }]);
    assert.equal(calls.toggle, 1, '确认真实导航仍然收起');

    dispose();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

test('回归防护：自动收起不得再按「工作区行」标记匹配', () => {
  assert.ok(
    !bundle.includes('[data-row-key^="session:"], [data-row-key^="workspace:"]'),
    '工作区标题行是展开/收起控件，按行标记收起会让用户永远展不开工作区',
  );
});

// ── 设置两级导航转接器 ──────────────────────────────────────────────────────

/** 造一套足够 installSettingsAdapter 使用的假文档。 */
function settingsFixture() {
  const backBar = {
    className: '',
    type: '',
    innerHTML: '',
    removed: false,
    handlers: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    remove() { this.removed = true; },
  };
  const appended = [];
  const options = {
    appendChild(node) { appended.push(node); },
    querySelector(selector) {
      if (selector !== '.dsh-mobile-settings-back-bar') return null;
      return appended.find((node) => String(node.className).includes('.dsh-mobile-settings-back-bar')
        || node.className === 'dsh-mobile-settings-back-bar') ?? null;
    },
  };
  const nav = {
    handlers: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
  };
  const attrs = new Map();
  const panel = {
    attrs,
    setAttribute(name, value) { attrs.set(name, value); },
    removeAttribute(name) { attrs.delete(name); },
    querySelector(selector) {
      if (selector === '.VOzbGW_options') return options;
      if (selector === '.VOzbGW_nav') return nav;
      if (selector === '.dsh-mobile-settings-back-bar') return options.querySelector(selector);
      return null;
    },
  };
  const doc = {
    body: {},
    querySelectorAll: (selector) => (selector === '.VOzbGW_panel' ? [panel] : []),
    createElement: () => backBar,
  };
  return { doc, panel, nav, options, backBar, appended, attrs };
}

test('设置适配器：打开即回到目录态，点分类进详情，返回条回目录', () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  applyMobilePrefs(DEFAULT_PREFS, styleFixture().doc);
  try {
    const f = settingsFixture();
    const dispose = installSettingsAdapter(f.doc);
    assert.equal(f.attrs.get('data-mobile-settings-view'), 'root', '面板打开时必须是目录态');
    assert.equal(f.appended.length, 1, '「返回目录」工具条被追加一次');
    assert.equal(f.backBar.innerHTML.includes('返回设置'), true, '工具条带文案');

    // 点任意分类（含当前选中项）都下钻
    f.nav.handlers.click({
      target: { closest: (selector) => (selector.includes('button, [role="tab"]') ? {} : null) },
    });
    assert.equal(f.attrs.get('data-mobile-settings-view'), 'detail', '点分类进入详情');

    // 返回条回目录
    f.backBar.handlers.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(f.attrs.get('data-mobile-settings-view'), 'root', '返回条回到目录');

    dispose();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

test('设置适配器：关掉分步导航后不写状态属性、移除返回条', () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  applyMobilePrefs({ ...DEFAULT_PREFS, stepSettings: false }, styleFixture().doc);
  try {
    const f = settingsFixture();
    const dispose = installSettingsAdapter(f.doc);
    assert.equal(f.attrs.has('data-mobile-settings-view'), false, '关闭分步导航后不得写状态属性');
    assert.equal(f.appended.length, 0, '关闭分步导航后不注入返回条');
    dispose();
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
    applyMobilePrefs(DEFAULT_PREFS, styleFixture().doc);
  }
});

// ── 观察器收敛（流式输出期间不得逐 mutation 扫描） ──────────────────────────

test('观察器：帧未挂载时等待，挂载后收敛成只盯抽屉属性的窄观察器', async () => {
  FakeMutationObserver.instances.length = 0;
  const originalWindow = globalThis.window;
  const originalObserver = globalThis.MutationObserver;
  globalThis.window = fakeWindow(390);
  globalThis.MutationObserver = FakeMutationObserver;
  try {
    const frameRef = { current: null };
    const f = installFixture({ collapsed: true, frameRef });
    const { ctx } = fakeCtx();
    const dispose = installResponsiveShell(ctx, f.doc);

    // 帧还没挂载：只有一个盯 body 的等待器
    assert.equal(FakeMutationObserver.instances.length, 1, '帧未挂载时只应有一个等待用观察器');
    const boot = FakeMutationObserver.instances[0];
    assert.equal(boot.targets[0], f.doc.body, '等待器盯 body');
    assert.equal(boot.options[0].childList, true, '等待器看 childList');

    // 帧挂载 → 等待器回调（requestSync → rAF → syncSidebarState）→ 收敛
    frameRef.current = f.frame;
    boot.callback();
    await Promise.resolve();
    assert.equal(boot.disconnected, true, '帧出现后等待器必须断开');

    const narrow = FakeMutationObserver.instances[1];
    assert.equal(narrow.targets[0], f.frame, '窄观察器盯帧元素本身');
    assert.equal(narrow.options[0].attributes, true, '窄观察器只看属性');
    assert.deepEqual(narrow.options[0].attributeFilter, ['data-sidebar-collapsed'], '只过滤抽屉属性');
    assert.equal(narrow.options[0].childList, undefined, '窄观察器不得带 childList（对话流每 token 都会触发）');
    assert.equal(narrow.options[0].subtree, undefined, '窄观察器不得带 subtree');

    dispose();
    assert.equal(narrow.disconnected, true, '卸载断开窄观察器');
  } finally {
    globalThis.window = originalWindow;
    globalThis.MutationObserver = originalObserver;
  }
});

// ── bundle 契约 ─────────────────────────────────────────────────────────────

test('移动端 bundle 契约：loader id、React 绑定与插件导出', () => {
  assert.ok(bundle.includes('id: "dsh-pocket-mobile"'), 'loader id = dsh-pocket-mobile');
  assert.ok(bundle.includes('var React = require("react")'), 'factory 必须注入 React');
  assert.ok(bundle.includes('name: () => name'), '导出 name');
  assert.ok(bundle.includes('inject: () => inject'), '导出 inject');
  assert.ok(bundle.includes('apply: () => apply'), '导出 apply');
  assert.ok(bundle.includes('plugins.row.config'), '注册插件管理配置行');
  assert.ok(bundle.includes('dsh-pocket#dsh-pocket-mobile'), '插件配置行 key 匹配');
});

test('移动端 bundle 契约：汉堡按钮注册进 conversation.header.leading 槽位', () => {
  assert.ok(
    bundle.includes('conversation.header.leading'),
    '汉堡按钮必须走 conversation.header.leading 槽位，而不是注入 React 拥有的 header',
  );
  assert.ok(bundle.includes('dsh-mobile-drawer-toggle'), '按钮 id 保留');
  assert.ok(!bundle.includes('insertBefore'), '不得再对 header 做 DOM 注入');
  assert.ok(!bundle.includes('.IW6AQa_iconButton'), '不得依赖桌面 shell.leading 才有的类名回退点击');
});

// ── 模型下拉高度：只有「进入具体模型」才该变长 ──────────────────────────────

test('模型下拉：只声明 bottom 会被 CSS 拉成整屏高，必须压掉框架 inline 的 top', () => {
  // 框架 dsh-client-ui-model-selection 用 inline style 给这个浮层定位：
  //   place() → setMenuPos({ left, top })；测量期是 MEASURE_STYLE{ visibility:hidden, left:0, top:0 }。
  // 而 position:fixed 的盒子在 top 与 bottom 都非 auto、height:auto 时，CSS 2.1 §10.6.4
  // 会把高度解成「两端之间填满」，再被 max-height 截住——于是只有「模型 / 思考强度」
  // 两行的根菜单被拉成 428px（headless chromium 复刻框架 inline top=57、390×844 实测）。
  const body = ruleBody(mobileCss(), '._7KE1Ra_menu');
  assert.match(body, /top:\s*auto\s*!important/, '必须显式 top: auto，压掉框架 inline 的 top');
  assert.match(body, /bottom:\s*80px\s*!important/, '底部浮层定位保持不变（拇指可及处）');
  assert.match(
    body,
    /max-height:\s*min\(420px,\s*60dvh\)\s*!important/,
    '只有进入模型子页才长到这个上限并内部滚动',
  );
});

// ── 全局面板返回键：面板接管主栏时唯一的出口 ────────────────────────────────

test('全局面板返回键：注册进 shell.overlay，按 panelInfo 显隐并给面板页让出一行', () => {
  const source = readFileSync(join(root, 'mobile', 'client', 'index.jsx'), 'utf8');
  // 面板接管主栏时会话连同它的 header 一起不渲染 → conversation.header.leading 里的
  // 汉堡按钮随之消失；抽屉又在面板身份变化时自动收起，DSH 客户端也不写 history
  // （浏览器返回键出不来），于是必须有一条常驻在任何主栏状态下的出口。
  assert.match(source, /name: 'shell\.overlay'/, '注册进 shell.overlay（AppFrame 无条件渲染的浮层槽）');
  assert.match(source, /selectPanel\(null\)/, '回会话走 ctx.layout 的公开语义');
  assert.match(
    source,
    /useSyncExternalStore\(\s*[\s\S]*?getSnapshot\(\)\?\.activePanelId/,
    '显隐只认 ctx.layout.panelInfo，不靠 DOM 观察器',
  );

  assert.ok(bundle.includes('shell.overlay'), '产物里必须带上 shell.overlay 注册');
  assert.ok(bundle.includes('dsh-pocket-mobile#panel-exit'), '条目 id 保留');

  const button = ruleBody(mobileCss(), '#dsh-mobile-panel-exit');
  assert.match(button, /position:\s*fixed\s*!important/, '悬浮在面板页之上');
  assert.match(
    button,
    /pointer-events:\s*auto\s*!important/,
    'overlayLayer 本身是 pointer-events:none，必须显式恢复',
  );
  assert.match(
    mobileCss(),
    /html\[data-dsh-mobile-panel\]\s+\.pI_x6G_centerCol\s*>\s*\[data-slot="main"\]\s*>\s*\*/,
    '面板页标题压在左上角，必须给返回键让出顶部一行',
  );
});
