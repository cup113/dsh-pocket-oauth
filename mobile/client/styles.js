/**
 * dsh-pocket-mobile: 移动端 CSS 样式库
 * 纯 JS 导出，无缝支持 Node.js 原生测试与 esbuild 构建
 *
 * 本文件是移动端样式的**唯一来源**：`responsive-shell.js` 组合后注入
 * `<style data-plugin-css="dsh-pocket-mobile/styles">`，esbuild 再把它内联进
 * `mobile/client/client.js`。刻意不做成 `.css` 文件导入 —— 原生 `node --test`
 * 无法 import CSS。
 */

export const shellCss = `
/* ==========================================================================
   dsh-pocket-mobile: 移动端核心框架与抽屉侧边栏样式

   与 DSH AppFrame 的真实 DOM 契约对齐。DocumentTitle 返回 null（不产生节点），
   所以 .pI_x6G_frame 的 DOM 子元素依次是：
     .pI_x6G_sidebarCol · .pI_x6G_centerCol · .pI_x6G_rightbarCol
     · .pI_x6G_overlayLayer · 条件渲染的 .pI_x6G_handle

   框架用 CSS-module 类名定位这三列（[data-column="…"] 之类的属性从未存在过），
   而 .pI_x6G_centerCol 的高度**只**来自 .pI_x6G_frame 的 grid-template-rows:100%。
   因此这里必须保留 grid：一旦改成 display:block，centerCol 就退化为 height:auto，
   塌缩到内容固有高度（hero 被压扁在屏幕上方 ~38% 的成因）。
   ========================================================================== */

@media (max-width: 1023px) {
  /* 根框架：保留 grid，收敛为单列单行全屏容器 */
  .pI_x6G_frame {
    display: grid !important;
    grid-template-columns: 100% !important;
    grid-template-rows: 100% !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    overflow: hidden !important;
  }

  /* 分栏拖拽手柄（DragHandle 渲染 div.pI_x6G_handle[data-side]）在手机上无意义 */
  .pI_x6G_handle {
    display: none !important;
  }

  /* 主对话栏：唯一定位在 1/1 并铺满整格 */
  .pI_x6G_centerCol {
    grid-area: 1 / 1 !important;
    display: flex !important;
    position: relative !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    z-index: 1 !important;
    overflow: hidden !important;
  }

  /* 左侧边栏：脱离文档流，改为移动端抽屉（Drawer） */
  .pI_x6G_sidebarCol {
    position: fixed !important;
    top: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    width: min(300px, 84vw) !important;
    max-width: 320px !important;
    height: 100vh !important;
    height: 100dvh !important;
    z-index: 1250 !important;
    background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)) !important;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.28) !important;
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    /* 刻意不声明 will-change —— transform 会让本元素成为包含块，
       使抽屉内部原有的 position:fixed 控件转而相对抽屉定位。 */
  }

  /* 收起态：唯一状态源是框架自己维护的 [data-sidebar-collapsed]
     （抽屉完全滑出左边缘，不留 56px 图标条占位，且不可命中） */
  .pI_x6G_frame[data-sidebar-collapsed] > .pI_x6G_sidebarCol {
    transform: translateX(-105%) !important;
    pointer-events: none !important;
    box-shadow: none !important;
  }

  /* 展开态：滑入视野 */
  .pI_x6G_frame:not([data-sidebar-collapsed]) > .pI_x6G_sidebarCol {
    transform: translateX(0) !important;
    pointer-events: auto !important;
  }

  /* 右侧栏在框架里是「轨道而非盒子」：移动端把轨道压成 0 宽并贴右边缘，
     面板仍由框架自己定位（收起时 hidden + 移出，打开时全屏覆盖）。
     这里刻意**不**加 pointer-events —— 框架已让面板自身 pointer-events:none
     并由其内容重新开启，再加一层会误伤子元素。 */
  .pI_x6G_rightbarCol {
    grid-area: 1 / 1 !important;
    justify-self: end !important;
    width: 0 !important;
    min-width: 0 !important;
  }

  /* 右侧栏打开时全屏覆盖 */
  .P3OORG_panel[data-sidebar-right-open] {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    z-index: 1260 !important;
  }

  /* 浮层与主栏同格叠放，保持框架的点击穿透语义（子元素仍由框架恢复 auto） */
  .pI_x6G_overlayLayer {
    grid-area: 1 / 1 !important;
    inset: 0 !important;
    pointer-events: none !important;
  }

  /* 对话流两侧的宽度拖拽手柄在窄屏会成为点击陷阱 */
  .wSkVaW_widthHandle {
    display: none !important;
  }

  /* 顶部会话 Header：触控友好（真实元素是 header.wSkVaW_header） */
  .pI_x6G_frame header {
    min-height: 44px !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
  }
}

/* 全局移动端侧边栏遮罩（Backdrop）：未激活时不占合成层、不拦点击 */
#dsh-mobile-sidebar-backdrop {
  position: fixed !important;
  inset: 0 !important;
  z-index: 1240 !important;
  background: rgba(0, 0, 0, 0.45) !important;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.22s ease, visibility 0s linear 0.22s !important;
}

#dsh-mobile-sidebar-backdrop.active {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  transition: opacity 0.22s ease, visibility 0s !important;
}

/* 配置开关：关闭「遮罩与点击收起」时完全不渲染遮罩 */
html[data-dsh-mobile-backdrop="off"] #dsh-mobile-sidebar-backdrop {
  display: none !important;
}

/* ==========================================================================
   全局面板（插件 / 定时任务）的「返回会话」键
   面板接管主栏时会话连同它的 header 一起不渲染，汉堡按钮随之消失；抽屉又在
   面板身份变化时自动收起，手机上就再没有回会话的入口（DSH 客户端不写 history，
   浏览器返回键也出不来）。这个按钮因此注册在 shell.overlay 槽位——它对任何
   主栏状态都挂在 .pI_x6G_overlayLayer 里（见 index.jsx 的 MobilePanelExit）。
   ========================================================================== */

#dsh-mobile-panel-exit {
  position: fixed !important;
  top: calc(8px + env(safe-area-inset-top, 0px)) !important;
  left: 10px !important;
  z-index: 30 !important;
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  height: 32px !important;
  padding: 0 12px 0 8px !important;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.16)) !important;
  border-radius: 16px !important;
  background: var(--dsw-alias-bg-layer-2, rgba(32, 32, 34, 0.92)) !important;
  color: var(--dsw-alias-label-primary) !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 1 !important;
  white-space: nowrap !important;
  cursor: pointer !important;
  /* overlayLayer 自己是 pointer-events:none，子元素必须显式恢复 */
  pointer-events: auto !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28) !important;
  -webkit-tap-highlight-color: transparent !important;
}

#dsh-mobile-panel-exit:active {
  opacity: 0.68 !important;
}

/* 面板页自己的标题就压在左上角：给返回键让出一行，别压字。
   钩子是组件投影出来的 html 属性——会话态没有它，所以不会误伤对话页。 */
@media (max-width: 1023px) {
  html[data-dsh-mobile-panel] .pI_x6G_centerCol > [data-slot="main"] > * {
    box-sizing: border-box !important;
    padding-top: 46px !important;
  }
}
`;

export const settingsCss = `
/* ==========================================================================
   dsh-pocket-mobile: 移动端设置弹窗两级导航与流式排版样式

   真实 DOM（客户端门户挂在 document.body 上）：
     .VOzbGW_overlay
       .VOzbGW_mask
       .VOzbGW_panel[role="dialog"]
         nav.VOzbGW_nav          （分类目录）
           .VOzbGW_navTitle
           .VOzbGW_navList > button.VOzbGW_navCell
         .VOzbGW_content
           .VOzbGW_header
           .VOzbGW_options       （设置正文）
   ========================================================================== */

@media (max-width: 1023px) {
  /* 设置弹窗遮罩与外层居中 */
  .VOzbGW_overlay {
    padding: 0 !important;
    display: flex !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    z-index: 1300 !important;
  }

  /* 设置面板容器：全屏，不留桌面边框 */
  .VOzbGW_panel {
    width: 100% !important;
    max-width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    border-radius: 0 !important;
    border: none !important;
    display: flex !important;
    flex-direction: column !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }

  /* 顶部标题栏 */
  .VOzbGW_header {
    height: 52px !important;
    min-height: 52px !important;
    padding: 0 16px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    border-bottom: 0.5px solid var(--dsw-alias-border-l2) !important;
    flex-shrink: 0 !important;
  }

  /* 面板内的内容容器（header + options）；框架里没有 VOzbGW 的 body 类 */
  .VOzbGW_content {
    display: flex !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
    flex-direction: column !important;
    min-width: 0 !important;
    overflow: hidden !important;
    position: relative !important;
  }

  /* ------------------------------------------------------------------------
     一级导航视图（适配器写入 data-mobile-settings-view="root" 时才生效；
     该属性不存在 = 用户关掉了分步导航，保持原始并排布局）
     ------------------------------------------------------------------------ */
  .VOzbGW_nav {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
    flex: 1 1 auto !important;
    border-right: none !important;
    padding: 16px 16px 32px !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }

  /* 分类选项按钮：移动端大触控条目 */
  .VOzbGW_nav button,
  .VOzbGW_nav [role="tab"] {
    width: 100% !important;
    min-height: 48px !important;
    padding: 12px 16px !important;
    font-size: 15px !important;
    font-weight: 500 !important;
    border-radius: var(--dsw-radius-lg, 12px) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04)) !important;
    border: 0.5px solid var(--dsw-alias-border-l3, rgba(255, 255, 255, 0.08)) !important;
    transition: background 0.15s ease, transform 0.1s ease !important;
  }

  .VOzbGW_nav button:active,
  .VOzbGW_nav [role="tab"]:active {
    transform: scale(0.98) !important;
    background: var(--dsw-alias-interactive-bg-hover) !important;
  }

  /* 为分类按钮追加原生级右指示箭头 */
  .VOzbGW_nav button::after,
  .VOzbGW_nav [role="tab"]::after {
    content: "›" !important;
    font-size: 20px !important;
    font-weight: 300 !important;
    color: var(--dsw-alias-label-tertiary) !important;
    margin-left: auto !important;
  }

  /* ------------------------------------------------------------------------
     状态分流：根视图隐藏右侧详情，详情态隐藏左侧导航
     ------------------------------------------------------------------------ */
  [data-mobile-settings-view="root"] .VOzbGW_options {
    display: none !important;
  }

  [data-mobile-settings-view="detail"] .VOzbGW_nav {
    display: none !important;
  }

  [data-mobile-settings-view="detail"] .VOzbGW_options {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    max-width: 100% !important;
    flex: 1 1 auto !important;
    padding: 14px 16px 40px !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }

  /* 移动端详情顶部注入的「返回目录」工具条。
     它由 settings-adapter 追加到 .VOzbGW_options 的**末尾**（避免打乱 React 的
     兄弟定位），靠 order:-1 提到视觉最前。 */
  .dsh-mobile-settings-back-bar {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    padding: 10px 14px !important;
    margin-bottom: 12px !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
    background: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.06)) !important;
    color: var(--dsw-alias-state-business-primary, #3964fe) !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    cursor: pointer !important;
    border: none !important;
    width: 100% !important;
    flex: none !important;
    order: -1 !important;
  }

  .dsh-mobile-settings-back-bar svg {
    width: 16px !important;
    height: 16px !important;
    flex-shrink: 0 !important;
  }

  /* ------------------------------------------------------------------------
     选项内容区流式自适应（根除单字竖排文字截断）
     只作用于承载文本的元素：代码块 / 输入框必须保持原始空白语义
     ------------------------------------------------------------------------ */
  .VOzbGW_options :where(p, span, div, li, label, h1, h2, h3, h4, h5, h6) {
    white-space: normal !important;
    word-break: break-word !important;
    overflow-wrap: anywhere !important;
  }

  .VOzbGW_options :where(pre, code, kbd, samp, input, textarea, select) {
    white-space: revert !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
  }

  /* 通用设置区、模型设置区、插件设置区宽度 100% 展开 */
  ._WvWnq_section,
  .pbvGtq_section,
  .zGbnIq_section,
  .rtSEdW_section,
  .X_2TxG_page {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    padding: 0 !important;
    gap: 14px !important;
  }

  /* 设置项每一行（例如开发者视图开关、语言切换、版本信息）改为纵向两级 */
  .Pt1bsG_row,
  .yIbyla_row,
  ._8HJdBW_group,
  .zGbnIq_rowCard,
  .rtSEdW_card {
    display: flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
    justify-content: flex-start !important;
    gap: 10px !important;
    width: 100% !important;
    padding: 14px 0 !important;
  }

  /* 行内操作开关和按钮移至下方全宽或自然右对齐 */
  .Pt1bsG_row > button,
  .Pt1bsG_row > div:last-child {
    align-self: flex-start !important;
  }

  /* 主题模式 3 个方块选择器（浅色/深色/跟随系统）改为 3 列等宽栅格 */
  ._8HJdBW_cubeRow {
    display: grid !important;
    grid-template-columns: repeat(3, 1fr) !important;
    gap: 8px !important;
    width: 100% !important;
  }

  ._8HJdBW_themeCube {
    flex: none !important;
    min-width: 0 !important;
    padding: 14px 4px !important;
    font-size: 13px !important;
    text-align: center !important;
  }

  /* 模型卡片与预设选项 */
  .zGbnIq_rows,
  .rtSEdW_cards {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
  }
}
`;

export const composerCss = `
/* ==========================================================================
   dsh-pocket-mobile: 移动端输入框（Composer）与控制栏优化
   由配置开关「输入框触屏与占位符完整显示」控制是否注入本段
   ========================================================================== */

@media (max-width: 1023px) {
  /* 输入框外层容器：收缩两侧多余间距，适配小屏 */
  .uV2eYG_root {
    padding: 0 8px 6px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  /* 输入框卡片主体 */
  .uV2eYG_card {
    border-radius: var(--dsw-radius-xl, 16px) !important;
    padding-top: 6px !important;
    gap: 8px !important;
    max-width: 100% !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08) !important;
  }

  /* 编辑文本区：字号 15px 避免 iOS 唤起虚拟键盘时页面自动放大 */
  .uV2eYG_input {
    min-height: 38px !important;
    font-size: 15px !important;
    line-height: 22px !important;
    padding: 4px 8px 0 10px !important;
    -webkit-user-select: text !important;
  }

  /* 彻底解决占位符截断问题：允许折行显示最多 2 行 */
  .uV2eYG_placeholder {
    inset: 4px 8px auto 10px !important;
    font-size: 14px !important;
    line-height: 20px !important;
    white-space: normal !important;
    display: -webkit-box !important;
    -webkit-box-orient: vertical !important;
    -webkit-line-clamp: 2 !important;
    line-clamp: 2 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  /* 底部操作行 */
  .uV2eYG_row {
    padding: 2px 6px 6px !important;
    gap: 6px !important;
    align-items: center !important;
    justify-content: space-between !important;
    flex-wrap: nowrap !important;
    min-width: 0 !important;
  }

  /* 左侧操作组：加号、权限、计划 */
  .uV2eYG_tools {
    gap: 6px !important;
    flex-shrink: 0 !important;
    min-width: 0 !important;
  }

  /* 加号按钮（附件与快捷指令）触摸热区放大 */
  .uV2eYG_add {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    border-radius: 50% !important;
  }

  .uV2eYG_modes {
    gap: 4px !important;
  }

  /* 右侧操作组：模型选择、活动状态、发送按钮 */
  .uV2eYG_trailing {
    gap: 6px !important;
    flex-shrink: 0 !important;
    margin-left: auto !important;
    align-items: center !important;
  }

  .uV2eYG_standardControls {
    gap: 6px !important;
    align-items: center !important;
  }

  /* 模型选择器触发按钮（ModelSelect）：精简尺寸与字号 */
  ._7KE1Ra_trigger {
    height: 32px !important;
    max-width: min(160px, 38vw) !important;
    padding: 0 6px !important;
    font-size: 12px !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
    background: var(--dsw-alias-fill-tsp-secondary, rgba(255, 255, 255, 0.05)) !important;
    gap: 3px !important;
  }

  /* 模型名称自适应截断 */
  ._7KE1Ra_triggerLabel {
    font-size: 12px !important;
    max-width: 100px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  /* 模型下拉浮动菜单（框架里已是 position:fixed）：移动端抬到拇指可及处。
     z-index 保持低于设置弹窗（1300）与侧边栏（1250），高于 Menu portal（1100）。

     top: auto 是必需的，不是保险：框架用 inline style 定位这个浮层
     （ModelSelect 的 place() → setMenuPos({left, top})，测量期是
     MEASURE_STYLE{visibility:hidden,left:0,top:0}），只覆盖 left/bottom 时
     inline 的 top 仍然生效。而 position:fixed 的盒子在 top 与 bottom 都非 auto、
     height:auto 时会按 CSS 2.1 §10.6.4 把高度解成「两端之间填满」，再被下面的
     max-height 截住 —— 于是只有「模型 / 思考强度」两行的根菜单被拉成 428px。
     压掉 top 之后根菜单回到内容高度（两行 ≈ 76px，实测），只有进入模型子页
     （搜索 + 列表）才长到 max-height 并内部滚动，这正是我们要的分寸。 */
  ._7KE1Ra_menu {
    position: fixed !important;
    top: auto !important;
    left: 10px !important;
    right: 10px !important;
    width: auto !important;
    max-width: calc(100vw - 20px) !important;
    bottom: 80px !important;
    max-height: min(420px, 60dvh) !important;
    z-index: 1180 !important;
    border-radius: 16px !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
    overflow: hidden !important;
  }

  /* 发送按钮（Primary Action）：拇指盲操大热区 */
  .uV2eYG_primary {
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    border-radius: 50% !important;
    transform: none !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* 底部辅助 Token 指示器栏 */
  .uV2eYG_dock {
    padding-top: 2px !important;
    gap: 8px !important;
  }

  /* 快捷指令 / 斜杠菜单：真实钩子是 data-trigger-menu（框架的
     ._3e4SsG_menu 已自撑满 composer 卡片宽度），这里只限制高度不溢出键盘。 */
  [data-trigger-menu] {
    max-height: min(400px, 45dvh) !important;
  }
}
`;

export const planCss = `
/* ==========================================================================
   dsh-pocket-mobile: Plan 模式、提问交互与审批面板移动端响应式样式
   ========================================================================== */

@media (max-width: 1023px) {
  /* ------------------------------------------------------------------------
     1. PlanReviewPanel：计划待审接管面板
     ------------------------------------------------------------------------ */
  .LVzXQa_frame {
    padding: 4px 8px 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .LVzXQa_card {
    border-radius: var(--dsw-radius-xl, 16px) !important;
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  }

  /* 顶部黄色状态条 */
  .LVzXQa_strip {
    padding: 10px 12px !important;
    font-size: 13px !important;
  }

  .LVzXQa_previewActions {
    margin-left: auto !important;
  }

  /* 「查看全文」链接按钮触摸热区放大 */
  .k74WwW_reviewLink {
    padding: 4px 8px !important;
    font-size: 12px !important;
    min-height: 28px !important;
  }

  /* 摘要区域 */
  .LVzXQa_summary {
    padding: 10px 12px !important;
  }

  .LVzXQa_title {
    font-size: 14px !important;
    line-height: 20px !important;
  }

  .LVzXQa_description {
    font-size: 13px !important;
    line-height: 18px !important;
    -webkit-line-clamp: 3 !important;
  }

  /* 底部操作行：全宽双列网格按钮 */
  .LVzXQa_footer {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    padding: 6px 12px 10px !important;
  }

  .LVzXQa_actions {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    width: 100% !important;
  }

  .LVzXQa_actions button {
    width: 100% !important;
    min-height: 38px !important;
    font-size: 13px !important;
    justify-content: center !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
  }

  /* ------------------------------------------------------------------------
     2. QuestionComposer：用户提问卡片（多选、单选、自定义回答）
     ------------------------------------------------------------------------ */
  .Mbwy4a_frame {
    padding: 4px 8px 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .Mbwy4a_card {
    border-radius: var(--dsw-radius-xl, 16px) !important;
    max-height: min(75dvh, 520px) !important;
    width: 100% !important;
    max-width: 100% !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14) !important;
  }

  .Mbwy4a_header {
    padding: 12px 12px 0 !important;
    gap: 8px !important;
  }

  .Mbwy4a_title {
    font-size: 14px !important;
    line-height: 20px !important;
  }

  .Mbwy4a_headerActions {
    gap: 2px !important;
  }

  .Mbwy4a_waitStatus {
    font-size: 11px !important;
    max-width: 90px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  .Mbwy4a_waitButton {
    padding: 2px 6px !important;
    font-size: 11px !important;
    height: 24px !important;
  }

  .Mbwy4a_body {
    padding: 0 12px !important;
    max-height: 48dvh !important;
  }

  .Mbwy4a_option {
    min-height: 44px !important;
    padding: 8px 10px !important;
    border-radius: var(--dsw-radius-lg, 10px) !important;
  }

  .Mbwy4a_footer {
    padding: 8px 12px !important;
    flex-wrap: wrap !important;
    gap: 8px !important;
  }

  .Mbwy4a_footerActions {
    margin-left: auto !important;
    gap: 8px !important;
  }

  .Mbwy4a_footerActions button {
    min-height: 36px !important;
    padding: 0 14px !important;
    font-size: 13px !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
  }

  /* ------------------------------------------------------------------------
     3. ApprovalPanel：工具越权审批卡片
     ------------------------------------------------------------------------ */
  .mna1RW_root {
    padding: 4px 8px 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .mna1RW_card {
    border-radius: var(--dsw-radius-xl, 16px) !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .mna1RW_strip {
    padding: 8px 12px !important;
    font-size: 13px !important;
  }

  .mna1RW_body {
    padding: 10px 12px 0 !important;
    max-height: 40dvh !important;
  }

  .mna1RW_command {
    max-height: 120px !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    font-size: 12px !important;
    padding: 6px 8px !important;
    border-radius: 6px !important;
    background: var(--dsw-alias-fill-tsp-secondary, rgba(0, 0, 0, 0.2)) !important;
  }

  .mna1RW_actionRow {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    padding: 8px 12px 10px !important;
    width: 100% !important;
  }

  .mna1RW_actionRow button {
    width: 100% !important;
    min-height: 38px !important;
    justify-content: center !important;
    font-size: 13px !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
  }

  /* ------------------------------------------------------------------------
     4. 对话流中的 PlanCard 与文件卡片
     ------------------------------------------------------------------------ */
  .k74WwW_card,
  .nyYjTG_file {
    width: 100% !important;
    min-height: 52px !important;
    border-radius: var(--dsw-radius-lg, 12px) !important;
  }

  /* 右侧边栏全屏计划文档阅读（PlanPreview） */
  .k74WwW_preview {
    padding: 12px 14px 40px !important;
  }

  .k74WwW_document {
    font-size: 15px !important;
    line-height: 1.6 !important;
    word-break: break-word !important;
  }

  .k74WwW_document pre {
    max-width: 100% !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    border-radius: 8px !important;
  }
}
`;

export const touchCss = `
/* ==========================================================================
   dsh-pocket-mobile: 移动端触控反馈、安全区域与对话流优化
   ========================================================================== */

@media (max-width: 1023px) {
  /* 全局移动端 CSS 变量覆写 */
  :root,
  body {
    --dsh-composer-side-clearance: 8px !important;
    --dsh-chat-side-clearance: 12px !important;
    --dsh-scrollbar-width: 3px !important;
    -webkit-tap-highlight-color: transparent !important;
    overscroll-behavior-y: none !important;
  }

  /* 交互元素启用快速触摸响应，消除 300ms 延迟 */
  button,
  a,
  [role="button"],
  [role="tab"],
  [role="option"],
  input,
  textarea,
  select {
    touch-action: manipulation !important;
  }

  /* 底部刘海屏 / Home Indicator 安全距离补偿 */
  .uV2eYG_root,
  .LVzXQa_frame,
  .Mbwy4a_frame,
  .mna1RW_root {
    padding-bottom: max(6px, env(safe-area-inset-bottom, 6px)) !important;
  }

  /* 会话 Header 里的汉堡抽屉按钮（注册在 conversation.header.leading） */
  #dsh-mobile-drawer-toggle {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    border-radius: 8px !important;
    border: none !important;
    background: transparent !important;
    color: var(--dsw-alias-label-primary) !important;
    cursor: pointer !important;
    padding: 0 !important;
    margin-right: 4px !important;
    flex-shrink: 0 !important;
  }

  #dsh-mobile-drawer-toggle:active {
    background: var(--dsw-alias-interactive-bg-hover) !important;
  }

  /* 对话流代码块与表格在窄屏上防撑破 */
  pre,
  code,
  table {
    max-width: 100% !important;
  }

  table {
    display: block !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
  }
}

/* 桌面端隐藏移动端专属控件（与 MOBILE_BREAKPOINT = 1024 对齐） */
@media (min-width: 1024px) {
  #dsh-mobile-drawer-toggle,
  #dsh-mobile-sidebar-backdrop,
  .dsh-mobile-settings-back-bar {
    display: none !important;
  }
}
`;
