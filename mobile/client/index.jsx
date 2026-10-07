/**
 * dsh-pocket-mobile: 移动端 WebUI 核心客户端插件
 * 为 DSH 0.2.0-rc.2 全方位提供触屏深度定制与移动端体验增强
 */

import { createElement as h, useState, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  DEFAULT_PREFS,
  MOBILE_PREF_KEY,
  applyMobilePrefs,
  installResponsiveShell,
  isMobileViewport,
  openDrawer,
} from './responsive-shell.js';
import { installSettingsAdapter } from './settings-adapter.js';

export const name = 'dsh-pocket-mobile';
// locale / theme 都不再使用：少一条依赖弧就少一次挂载顺序约束。
export const inject = ['slots', 'layout'];

/** 从 localStorage 读取配置（损坏时回落到默认值）。 */
function loadPrefs() {
  const fallback = { ...DEFAULT_PREFS };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(MOBILE_PREF_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

/** 写回 localStorage（隐私模式等失败场景静默忽略）。 */
function savePrefs(prefs) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MOBILE_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/**
 * 汉堡抽屉按钮：注册在框架声明的 `conversation.header.leading` 槽位里，
 * 因此永远待在 header 的 leading flex 行中随 React 一起增删，
 * 不再对 React 拥有的 header 做 DOM 注入（那会被重渲染清掉、并破坏 header 网格）。
 * @param {object} props 含 onClick
 * @returns {object} 按钮元素
 */
function DrawerToggleButton({ onClick }) {
  return h(
    'button',
    {
      type: 'button',
      id: 'dsh-mobile-drawer-toggle',
      className: 'dsh-mobile-drawer-toggle',
      'aria-label': '切换侧边栏菜单',
      onClick,
    },
    h(
      'svg',
      {
        width: 20,
        height: 20,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
      h('line', { key: 'top', x1: 3, y1: 6, x2: 21, y2: 6 }),
      h('line', { key: 'mid', x1: 3, y1: 12, x2: 21, y2: 12 }),
      h('line', { key: 'bottom', x1: 3, y1: 18, x2: 21, y2: 18 }),
    ),
  );
}

/**
 * 订阅「当前视口是否按移动端排版」。
 * 汉堡按钮与面板返回键都要跟着旋转屏幕实时显隐，抽出来避免两份 resize 监听。
 * @returns {boolean} 是否移动端视口
 */
function useMobileViewport() {
  const [mobile, setMobile] = useState(() => isMobileViewport());
  useEffect(() => {
    const sync = () => setMobile(isMobileViewport());
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);
  return mobile;
}

/** panelInfo 缺失时的空源：与框架 renderer 的 absentSource 同形，保证 hook 调用顺序不变。 */
const ABSENT_PANEL_INFO = {
  getSnapshot: () => null,
  subscribe: () => () => {},
};

/**
 * 面板返回键：全局面板（插件 / 定时任务）接管主栏时，会话连同它的 header
 * 一起不渲染，注册在 conversation.header.leading 的汉堡按钮随之消失；抽屉又会在
 * 面板身份变化时自动收起，手机上就再没有回会话的入口（DSH 客户端不写 history，
 * 浏览器返回键也出不来，只能刷新页面）。因此这里挂到 shell.overlay 槽位：
 * 它对任何主栏状态都挂在 .pI_x6G_overlayLayer 里。
 *
 * 显隐只认 ctx.layout.panelInfo（已经 inject 的 layout 服务），不靠 DOM 观察器。
 * 同时把它投影成 html[data-dsh-mobile-panel]，让 styles.js 给面板页让出顶部一行。
 * @param {object} props 含 onExit（回会话）与 panelInfo（layout 的面板选择源）
 * @returns {object|null} 返回键元素（非移动端 / 无面板时不渲染）
 */
function MobilePanelExit({ onExit, panelInfo }) {
  const mobile = useMobileViewport();
  const usable =
    typeof panelInfo?.getSnapshot === 'function' && typeof panelInfo?.subscribe === 'function';
  const source = usable ? panelInfo : ABSENT_PANEL_INFO;
  const activePanelId = useSyncExternalStore(
    (listener) => source.subscribe(listener),
    () => source.getSnapshot()?.activePanelId ?? null,
  );
  const visible = mobile && activePanelId !== null;

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute('data-dsh-mobile-panel', 'true');
    else root.removeAttribute('data-dsh-mobile-panel');
    return () => root.removeAttribute('data-dsh-mobile-panel');
  }, [visible]);

  if (!visible) return null;
  return h(
    'button',
    {
      type: 'button',
      id: 'dsh-mobile-panel-exit',
      className: 'dsh-mobile-panel-exit',
      'aria-label': '返回会话',
      onClick: onExit,
    },
    h(
      'svg',
      {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
      h('line', { key: 'shaft', x1: 20, y1: 12, x2: 5, y2: 12 }),
      h('polyline', { key: 'head', points: '11 6 5 12 11 18' }),
    ),
    '返回会话',
  );
}

/**
 * 移动端组件配置页（注册在 plugins.row.config: dsh-pocket#dsh-pocket-mobile）
 * 三个开关都会真实生效：
 *   - drawerBackdrop  → <html data-dsh-mobile-backdrop="off"> 关掉遮罩与点击收起
 *   - compactComposer → 决定是否注入整段输入框样式
 *   - stepSettings    → 决定设置适配器是否写入两级导航状态属性
 */
function MobileConfigPage() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [saved, setSaved] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      applyMobilePrefs(prefs);
      return undefined;
    }
    savePrefs(prefs);
    applyMobilePrefs(prefs);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [prefs]);

  // 多标签页同步
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event) => {
      if (event.key !== MOBILE_PREF_KEY || event.newValue === null) return;
      try {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(event.newValue) });
      } catch {
        // 损坏的写入忽略
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return h(
    'div',
    {
      style: {
        padding: '16px 20px 40px',
        maxWidth: 640,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'inherit',
      },
    },
    // 标题与说明
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
      h('h3', { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, '手机端 WebUI 体验增强'),
      h(
        'p',
        { style: { margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.5 } },
        '已启用针对手机触屏与窄屏视口的深度自适应优化，覆盖侧边栏抽屉、设置两级导航、触屏输入框及 Plan 审阅卡片。',
      ),
    ),
    // 状态特性列表
    h(
      'div',
      {
        style: {
          background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.04))',
          border: '1px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.08))',
          borderRadius: 12,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        },
      },
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 } },
        h('span', { style: { color: 'var(--dsw-alias-state-success-primary, #10b981)' } }, '●'),
        '核心增强已生效',
        saved
          ? h('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginLeft: 'auto' } }, '设置已更新')
          : null,
      ),
      h(
        'ul',
        {
          style: {
            margin: 0,
            paddingLeft: 20,
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--dsw-alias-label-secondary)',
          },
        },
        h('li', null, '抽屉式左侧栏：主对话栏始终铺满整屏，展开时以抽屉浮出而不挤压内容'),
        h('li', null, '全局面板返回键：插件 / 定时任务页左上角一键回到会话，不再被困在面板里'),
        h('li', null, '两级设置导航：消除小屏左右并排挤压导致中文单个字竖向折行，支持一键返回'),
        h('li', null, '输入框防截断：完整展示多行提示词，放大底部发送与功能按钮触控热区'),
        h('li', null, 'Plan 模式与审批优化：全屏沉浸式计划预览，底部大按钮防止误触与小屏溢出'),
      ),
    ),
    // 开关选项组
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      h('h4', { style: { margin: '8px 0 0', fontSize: 14, fontWeight: 600 } }, '功能微调选项'),
      // 选项 1
      h(
        'label',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            borderRadius: 10,
            cursor: 'pointer',
          },
        },
        h(
          'span',
          { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { style: { fontSize: 14, fontWeight: 500 } }, '抽屉侧边栏遮罩与点击收起'),
          h(
            'span',
            { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } },
            '展开侧栏时呈现半透明背景并允许点击关闭；关闭后只能靠会话/工作区行自动收起',
          ),
        ),
        h('input', {
          type: 'checkbox',
          checked: prefs.drawerBackdrop,
          onChange: () => toggle('drawerBackdrop'),
          style: { width: 18, height: 18, cursor: 'pointer' },
        }),
      ),
      // 选项 2
      h(
        'label',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            borderRadius: 10,
            cursor: 'pointer',
          },
        },
        h(
          'span',
          { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { style: { fontSize: 14, fontWeight: 500 } }, '输入框触屏与占位符完整显示'),
          h(
            'span',
            { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } },
            '占位文字折行、发送与附件按钮放大热区、模型菜单改为底部浮层',
          ),
        ),
        h('input', {
          type: 'checkbox',
          checked: prefs.compactComposer,
          onChange: () => toggle('compactComposer'),
          style: { width: 18, height: 18, cursor: 'pointer' },
        }),
      ),
      // 选项 3
      h(
        'label',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--dsw-alias-bg-layer-1)',
            border: '0.5px solid var(--dsw-alias-border-l2)',
            borderRadius: 10,
            cursor: 'pointer',
          },
        },
        h(
          'span',
          { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
          h('span', { style: { fontSize: 14, fontWeight: 500 } }, '移动端设置面板分步下钻导航'),
          h(
            'span',
            { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } },
            '目录与详情两级展示，根除字竖排挤压；关闭后分类列表与内容改在同一页纵向排列，不做下钻',
          ),
        ),
        h('input', {
          type: 'checkbox',
          checked: prefs.stepSettings,
          onChange: () => toggle('stepSettings'),
          style: { width: 18, height: 18, cursor: 'pointer' },
        }),
      ),
    ),
  );
}

/**
 * 客户端插件注册入口
 * @param {object} ctx 客户端插件上下文
 */
export function apply(ctx) {
  // 0. 先把用户配置投影出去（html 属性 + 样式注入）
  applyMobilePrefs(loadPrefs());

  // 1. 安装移动端 Shell 抽屉与样式体系
  const disposeShell = installResponsiveShell(ctx);
  ctx.effect(() => disposeShell, 'dsh-pocket-mobile: responsive shell');

  // 2. 安装移动端设置弹窗两级导航转接器
  const disposeSettings = installSettingsAdapter();
  ctx.effect(() => disposeSettings, 'dsh-pocket-mobile: settings adapter');

  // 3. 汉堡抽屉按钮：注册进框架声明的 conversation.header.leading 槽位。
  //    该槽位是 single/root 且当前无人占用；框架给条目套的锚点是 display:contents，
  //    按钮因此直接成为 .wSkVaW_headerLeading（flex 行）的子元素，不破坏 header 网格。
  function MobileDrawerToggle() {
    if (!useMobileViewport()) return null;
    return h(DrawerToggleButton, { onClick: () => openDrawer(ctx) });
  }

  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register({ name: 'conversation.header.leading' }, MobileDrawerToggle),
  );

  // 3b. 全局面板返回键：注册进 shell.overlay（root scope 的 list 槽，AppFrame 无条件
  //     渲染 .pI_x6G_overlayLayer），因为面板一旦接管主栏，会话 header 里的汉堡按钮
  //     就跟着会话一起消失，手机上再无回会话的入口（详见 MobilePanelExit 的注释）。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-pocket-mobile#panel-exit',
        inject: () => ({
          onExit: () => ctx.layout.selectPanel(null),
          panelInfo: ctx.layout.panelInfo,
        }),
      },
      MobilePanelExit,
    ),
  );

  // 4. 注册插件管理配置卡片
  ctx.slots.inject('plugins.row.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.row.config',
        key: 'dsh-pocket#dsh-pocket-mobile',
      },
      MobileConfigPage,
    ),
  );
}
