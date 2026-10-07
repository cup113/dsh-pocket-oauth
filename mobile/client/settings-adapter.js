/**
 * dsh-pocket-mobile: 移动端设置弹窗两级导航（目录 ↔ 详情）自适应转接器
 * 消除左侧固定列挤占右侧空间导致文字竖向折行
 *
 * 真实 DOM（面板是挂在 document.body 上的门户，开关即挂载/卸载）：
 *   .VOzbGW_panel[role="dialog"]
 *     nav.VOzbGW_nav  > .VOzbGW_navList > button.VOzbGW_navCell
 *     .VOzbGW_content > .VOzbGW_header + .VOzbGW_options
 */

import { isMobileViewport, readMobilePrefs } from './responsive-shell.js';

/** 「返回目录」工具条的类名。 */
export const BACK_BAR_CLASS = 'dsh-mobile-settings-back-bar';

/**
 * 安装设置弹窗移动端转接器
 * @param {Document} [doc] 目标文档
 * @returns {() => void} 清理函数
 */
export function installSettingsAdapter(doc = document) {
  if (typeof window === 'undefined') return () => {};

  /** panel 元素 → 是否已初始化视图状态（面板每次打开都是新元素，天然回到 root）。 */
  const initializedPanels = new WeakSet();
  /** nav 元素 → 是否已绑定分类点击。 */
  const boundNavs = new WeakSet();

  const ensureBackBar = (panel, options) => {
    if (options.querySelector(`.${BACK_BAR_CLASS}`)) return;
    const backBar = doc.createElement('button');
    backBar.type = 'button';
    backBar.className = BACK_BAR_CLASS;
    backBar.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" '
      + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M10 13L5 8L10 3"></path></svg><span>返回设置</span>';
    backBar.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      panel.setAttribute('data-mobile-settings-view', 'root');
    });
    // 追加到末尾并用 CSS order:-1 提到视觉最前：绝不插到 React 管理子序列的开头，
    // 那会打乱 React 用已知兄弟节点做的 insertBefore 定位。
    options.appendChild(backBar);
  };

  const handleSettingsPanel = (panel) => {
    if (!isMobileViewport(window.innerWidth)) {
      panel.removeAttribute('data-mobile-settings-view');
      return;
    }

    // 用户关掉了「分步下钻导航」：不写状态属性，CSS 的两级布局规则就整体失效
    if (readMobilePrefs().stepSettings === false) {
      panel.removeAttribute('data-mobile-settings-view');
      panel.querySelector(`.${BACK_BAR_CLASS}`)?.remove();
      return;
    }

    if (!initializedPanels.has(panel)) {
      initializedPanels.add(panel);
      // 每次打开都从目录开始，而不是停留在上次的详情页
      panel.setAttribute('data-mobile-settings-view', 'root');
    }

    const options = panel.querySelector('.VOzbGW_options');
    if (options) ensureBackBar(panel, options);

    // 点击任意分类条目（含当前选中项）都下钻到它的详情
    const nav = panel.querySelector('.VOzbGW_nav');
    if (nav && !boundNavs.has(nav)) {
      boundNavs.add(nav);
      nav.addEventListener('click', (event) => {
        const target = event.target;
        if (target && typeof target.closest === 'function' && target.closest('button, [role="tab"]')) {
          panel.setAttribute('data-mobile-settings-view', 'detail');
        }
      });
    }
  };

  const syncSettings = () => {
    doc.querySelectorAll('.VOzbGW_panel').forEach(handleSettingsPanel);
  };

  // rAF 合并：设置面板内部的开关/表单会持续产生 mutation，逐条全文档扫描太贵
  let queued = false;
  const requestSync = () => {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      syncSettings();
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
    else run();
  };

  const observer = new MutationObserver(requestSync);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('resize', requestSync);
  syncSettings();

  return () => {
    queued = false;
    observer.disconnect();
    window.removeEventListener('resize', requestSync);
  };
}
