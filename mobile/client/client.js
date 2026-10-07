window.__ModuleLoader__.load({
  id: "dsh-pocket-mobile",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // The DSH client module system provides react as a module, never as a
    // global. esbuild keeps react external (see the build config above) and its
    // classic JSX transform emits bare React.createElement calls, so the
    // factory must bind React itself - otherwise any JSX in the sources crashes
    // at render time with "ReferenceError: React is not defined". The binding
    // costs nothing and must survive a future second target.
    var React = require("react");
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// mobile/client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// mobile/client/styles.js
var shellCss = `
/* ==========================================================================
   dsh-pocket-mobile: \u79FB\u52A8\u7AEF\u6838\u5FC3\u6846\u67B6\u4E0E\u62BD\u5C49\u4FA7\u8FB9\u680F\u6837\u5F0F

   \u4E0E DSH AppFrame \u7684\u771F\u5B9E DOM \u5951\u7EA6\u5BF9\u9F50\u3002DocumentTitle \u8FD4\u56DE null\uFF08\u4E0D\u4EA7\u751F\u8282\u70B9\uFF09\uFF0C
   \u6240\u4EE5 .pI_x6G_frame \u7684 DOM \u5B50\u5143\u7D20\u4F9D\u6B21\u662F\uFF1A
     .pI_x6G_sidebarCol \xB7 .pI_x6G_centerCol \xB7 .pI_x6G_rightbarCol
     \xB7 .pI_x6G_overlayLayer \xB7 \u6761\u4EF6\u6E32\u67D3\u7684 .pI_x6G_handle

   \u6846\u67B6\u7528 CSS-module \u7C7B\u540D\u5B9A\u4F4D\u8FD9\u4E09\u5217\uFF08[data-column="\u2026"] \u4E4B\u7C7B\u7684\u5C5E\u6027\u4ECE\u672A\u5B58\u5728\u8FC7\uFF09\uFF0C
   \u800C .pI_x6G_centerCol \u7684\u9AD8\u5EA6**\u53EA**\u6765\u81EA .pI_x6G_frame \u7684 grid-template-rows:100%\u3002
   \u56E0\u6B64\u8FD9\u91CC\u5FC5\u987B\u4FDD\u7559 grid\uFF1A\u4E00\u65E6\u6539\u6210 display:block\uFF0CcenterCol \u5C31\u9000\u5316\u4E3A height:auto\uFF0C
   \u584C\u7F29\u5230\u5185\u5BB9\u56FA\u6709\u9AD8\u5EA6\uFF08hero \u88AB\u538B\u6241\u5728\u5C4F\u5E55\u4E0A\u65B9 ~38% \u7684\u6210\u56E0\uFF09\u3002
   ========================================================================== */

@media (max-width: 1023px) {
  /* \u6839\u6846\u67B6\uFF1A\u4FDD\u7559 grid\uFF0C\u6536\u655B\u4E3A\u5355\u5217\u5355\u884C\u5168\u5C4F\u5BB9\u5668 */
  .pI_x6G_frame {
    display: grid !important;
    grid-template-columns: 100% !important;
    grid-template-rows: 100% !important;
    width: 100% !important;
    height: 100vh !important;
    height: 100dvh !important;
    overflow: hidden !important;
  }

  /* \u5206\u680F\u62D6\u62FD\u624B\u67C4\uFF08DragHandle \u6E32\u67D3 div.pI_x6G_handle[data-side]\uFF09\u5728\u624B\u673A\u4E0A\u65E0\u610F\u4E49 */
  .pI_x6G_handle {
    display: none !important;
  }

  /* \u4E3B\u5BF9\u8BDD\u680F\uFF1A\u552F\u4E00\u5B9A\u4F4D\u5728 1/1 \u5E76\u94FA\u6EE1\u6574\u683C */
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

  /* \u5DE6\u4FA7\u8FB9\u680F\uFF1A\u8131\u79BB\u6587\u6863\u6D41\uFF0C\u6539\u4E3A\u79FB\u52A8\u7AEF\u62BD\u5C49\uFF08Drawer\uFF09 */
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
    /* \u523B\u610F\u4E0D\u58F0\u660E will-change \u2014\u2014 transform \u4F1A\u8BA9\u672C\u5143\u7D20\u6210\u4E3A\u5305\u542B\u5757\uFF0C
       \u4F7F\u62BD\u5C49\u5185\u90E8\u539F\u6709\u7684 position:fixed \u63A7\u4EF6\u8F6C\u800C\u76F8\u5BF9\u62BD\u5C49\u5B9A\u4F4D\u3002 */
  }

  /* \u6536\u8D77\u6001\uFF1A\u552F\u4E00\u72B6\u6001\u6E90\u662F\u6846\u67B6\u81EA\u5DF1\u7EF4\u62A4\u7684 [data-sidebar-collapsed]
     \uFF08\u62BD\u5C49\u5B8C\u5168\u6ED1\u51FA\u5DE6\u8FB9\u7F18\uFF0C\u4E0D\u7559 56px \u56FE\u6807\u6761\u5360\u4F4D\uFF0C\u4E14\u4E0D\u53EF\u547D\u4E2D\uFF09 */
  .pI_x6G_frame[data-sidebar-collapsed] > .pI_x6G_sidebarCol {
    transform: translateX(-105%) !important;
    pointer-events: none !important;
    box-shadow: none !important;
  }

  /* \u5C55\u5F00\u6001\uFF1A\u6ED1\u5165\u89C6\u91CE */
  .pI_x6G_frame:not([data-sidebar-collapsed]) > .pI_x6G_sidebarCol {
    transform: translateX(0) !important;
    pointer-events: auto !important;
  }

  /* \u53F3\u4FA7\u680F\u5728\u6846\u67B6\u91CC\u662F\u300C\u8F68\u9053\u800C\u975E\u76D2\u5B50\u300D\uFF1A\u79FB\u52A8\u7AEF\u628A\u8F68\u9053\u538B\u6210 0 \u5BBD\u5E76\u8D34\u53F3\u8FB9\u7F18\uFF0C
     \u9762\u677F\u4ECD\u7531\u6846\u67B6\u81EA\u5DF1\u5B9A\u4F4D\uFF08\u6536\u8D77\u65F6 hidden + \u79FB\u51FA\uFF0C\u6253\u5F00\u65F6\u5168\u5C4F\u8986\u76D6\uFF09\u3002
     \u8FD9\u91CC\u523B\u610F**\u4E0D**\u52A0 pointer-events \u2014\u2014 \u6846\u67B6\u5DF2\u8BA9\u9762\u677F\u81EA\u8EAB pointer-events:none
     \u5E76\u7531\u5176\u5185\u5BB9\u91CD\u65B0\u5F00\u542F\uFF0C\u518D\u52A0\u4E00\u5C42\u4F1A\u8BEF\u4F24\u5B50\u5143\u7D20\u3002 */
  .pI_x6G_rightbarCol {
    grid-area: 1 / 1 !important;
    justify-self: end !important;
    width: 0 !important;
    min-width: 0 !important;
  }

  /* \u53F3\u4FA7\u680F\u6253\u5F00\u65F6\u5168\u5C4F\u8986\u76D6 */
  .P3OORG_panel[data-sidebar-right-open] {
    position: fixed !important;
    inset: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    z-index: 1260 !important;
  }

  /* \u6D6E\u5C42\u4E0E\u4E3B\u680F\u540C\u683C\u53E0\u653E\uFF0C\u4FDD\u6301\u6846\u67B6\u7684\u70B9\u51FB\u7A7F\u900F\u8BED\u4E49\uFF08\u5B50\u5143\u7D20\u4ECD\u7531\u6846\u67B6\u6062\u590D auto\uFF09 */
  .pI_x6G_overlayLayer {
    grid-area: 1 / 1 !important;
    inset: 0 !important;
    pointer-events: none !important;
  }

  /* \u5BF9\u8BDD\u6D41\u4E24\u4FA7\u7684\u5BBD\u5EA6\u62D6\u62FD\u624B\u67C4\u5728\u7A84\u5C4F\u4F1A\u6210\u4E3A\u70B9\u51FB\u9677\u9631 */
  .wSkVaW_widthHandle {
    display: none !important;
  }

  /* \u9876\u90E8\u4F1A\u8BDD Header\uFF1A\u89E6\u63A7\u53CB\u597D\uFF08\u771F\u5B9E\u5143\u7D20\u662F header.wSkVaW_header\uFF09 */
  .pI_x6G_frame header {
    min-height: 44px !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
  }
}

/* \u5168\u5C40\u79FB\u52A8\u7AEF\u4FA7\u8FB9\u680F\u906E\u7F69\uFF08Backdrop\uFF09\uFF1A\u672A\u6FC0\u6D3B\u65F6\u4E0D\u5360\u5408\u6210\u5C42\u3001\u4E0D\u62E6\u70B9\u51FB */
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

/* \u914D\u7F6E\u5F00\u5173\uFF1A\u5173\u95ED\u300C\u906E\u7F69\u4E0E\u70B9\u51FB\u6536\u8D77\u300D\u65F6\u5B8C\u5168\u4E0D\u6E32\u67D3\u906E\u7F69 */
html[data-dsh-mobile-backdrop="off"] #dsh-mobile-sidebar-backdrop {
  display: none !important;
}

/* ==========================================================================
   \u5168\u5C40\u9762\u677F\uFF08\u63D2\u4EF6 / \u5B9A\u65F6\u4EFB\u52A1\uFF09\u7684\u300C\u8FD4\u56DE\u4F1A\u8BDD\u300D\u952E
   \u9762\u677F\u63A5\u7BA1\u4E3B\u680F\u65F6\u4F1A\u8BDD\u8FDE\u540C\u5B83\u7684 header \u4E00\u8D77\u4E0D\u6E32\u67D3\uFF0C\u6C49\u5821\u6309\u94AE\u968F\u4E4B\u6D88\u5931\uFF1B\u62BD\u5C49\u53C8\u5728
   \u9762\u677F\u8EAB\u4EFD\u53D8\u5316\u65F6\u81EA\u52A8\u6536\u8D77\uFF0C\u624B\u673A\u4E0A\u5C31\u518D\u6CA1\u6709\u56DE\u4F1A\u8BDD\u7684\u5165\u53E3\uFF08DSH \u5BA2\u6237\u7AEF\u4E0D\u5199 history\uFF0C
   \u6D4F\u89C8\u5668\u8FD4\u56DE\u952E\u4E5F\u51FA\u4E0D\u6765\uFF09\u3002\u8FD9\u4E2A\u6309\u94AE\u56E0\u6B64\u6CE8\u518C\u5728 shell.overlay \u69FD\u4F4D\u2014\u2014\u5B83\u5BF9\u4EFB\u4F55
   \u4E3B\u680F\u72B6\u6001\u90FD\u6302\u5728 .pI_x6G_overlayLayer \u91CC\uFF08\u89C1 index.jsx \u7684 MobilePanelExit\uFF09\u3002
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
  /* overlayLayer \u81EA\u5DF1\u662F pointer-events:none\uFF0C\u5B50\u5143\u7D20\u5FC5\u987B\u663E\u5F0F\u6062\u590D */
  pointer-events: auto !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.28) !important;
  -webkit-tap-highlight-color: transparent !important;
}

#dsh-mobile-panel-exit:active {
  opacity: 0.68 !important;
}

/* \u9762\u677F\u9875\u81EA\u5DF1\u7684\u6807\u9898\u5C31\u538B\u5728\u5DE6\u4E0A\u89D2\uFF1A\u7ED9\u8FD4\u56DE\u952E\u8BA9\u51FA\u4E00\u884C\uFF0C\u522B\u538B\u5B57\u3002
   \u94A9\u5B50\u662F\u7EC4\u4EF6\u6295\u5F71\u51FA\u6765\u7684 html \u5C5E\u6027\u2014\u2014\u4F1A\u8BDD\u6001\u6CA1\u6709\u5B83\uFF0C\u6240\u4EE5\u4E0D\u4F1A\u8BEF\u4F24\u5BF9\u8BDD\u9875\u3002 */
@media (max-width: 1023px) {
  html[data-dsh-mobile-panel] .pI_x6G_centerCol > [data-slot="main"] > * {
    box-sizing: border-box !important;
    padding-top: 46px !important;
  }
}
`;
var settingsCss = `
/* ==========================================================================
   dsh-pocket-mobile: \u79FB\u52A8\u7AEF\u8BBE\u7F6E\u5F39\u7A97\u4E24\u7EA7\u5BFC\u822A\u4E0E\u6D41\u5F0F\u6392\u7248\u6837\u5F0F

   \u771F\u5B9E DOM\uFF08\u5BA2\u6237\u7AEF\u95E8\u6237\u6302\u5728 document.body \u4E0A\uFF09\uFF1A
     .VOzbGW_overlay
       .VOzbGW_mask
       .VOzbGW_panel[role="dialog"]
         nav.VOzbGW_nav          \uFF08\u5206\u7C7B\u76EE\u5F55\uFF09
           .VOzbGW_navTitle
           .VOzbGW_navList > button.VOzbGW_navCell
         .VOzbGW_content
           .VOzbGW_header
           .VOzbGW_options       \uFF08\u8BBE\u7F6E\u6B63\u6587\uFF09
   ========================================================================== */

@media (max-width: 1023px) {
  /* \u8BBE\u7F6E\u5F39\u7A97\u906E\u7F69\u4E0E\u5916\u5C42\u5C45\u4E2D */
  .VOzbGW_overlay {
    padding: 0 !important;
    display: flex !important;
    align-items: stretch !important;
    justify-content: stretch !important;
    z-index: 1300 !important;
  }

  /* \u8BBE\u7F6E\u9762\u677F\u5BB9\u5668\uFF1A\u5168\u5C4F\uFF0C\u4E0D\u7559\u684C\u9762\u8FB9\u6846 */
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

  /* \u9876\u90E8\u6807\u9898\u680F */
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

  /* \u9762\u677F\u5185\u7684\u5185\u5BB9\u5BB9\u5668\uFF08header + options\uFF09\uFF1B\u6846\u67B6\u91CC\u6CA1\u6709 VOzbGW \u7684 body \u7C7B */
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
     \u4E00\u7EA7\u5BFC\u822A\u89C6\u56FE\uFF08\u9002\u914D\u5668\u5199\u5165 data-mobile-settings-view="root" \u65F6\u624D\u751F\u6548\uFF1B
     \u8BE5\u5C5E\u6027\u4E0D\u5B58\u5728 = \u7528\u6237\u5173\u6389\u4E86\u5206\u6B65\u5BFC\u822A\uFF0C\u4FDD\u6301\u539F\u59CB\u5E76\u6392\u5E03\u5C40\uFF09
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

  /* \u5206\u7C7B\u9009\u9879\u6309\u94AE\uFF1A\u79FB\u52A8\u7AEF\u5927\u89E6\u63A7\u6761\u76EE */
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

  /* \u4E3A\u5206\u7C7B\u6309\u94AE\u8FFD\u52A0\u539F\u751F\u7EA7\u53F3\u6307\u793A\u7BAD\u5934 */
  .VOzbGW_nav button::after,
  .VOzbGW_nav [role="tab"]::after {
    content: "\u203A" !important;
    font-size: 20px !important;
    font-weight: 300 !important;
    color: var(--dsw-alias-label-tertiary) !important;
    margin-left: auto !important;
  }

  /* ------------------------------------------------------------------------
     \u72B6\u6001\u5206\u6D41\uFF1A\u6839\u89C6\u56FE\u9690\u85CF\u53F3\u4FA7\u8BE6\u60C5\uFF0C\u8BE6\u60C5\u6001\u9690\u85CF\u5DE6\u4FA7\u5BFC\u822A
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

  /* \u79FB\u52A8\u7AEF\u8BE6\u60C5\u9876\u90E8\u6CE8\u5165\u7684\u300C\u8FD4\u56DE\u76EE\u5F55\u300D\u5DE5\u5177\u6761\u3002
     \u5B83\u7531 settings-adapter \u8FFD\u52A0\u5230 .VOzbGW_options \u7684**\u672B\u5C3E**\uFF08\u907F\u514D\u6253\u4E71 React \u7684
     \u5144\u5F1F\u5B9A\u4F4D\uFF09\uFF0C\u9760 order:-1 \u63D0\u5230\u89C6\u89C9\u6700\u524D\u3002 */
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
     \u9009\u9879\u5185\u5BB9\u533A\u6D41\u5F0F\u81EA\u9002\u5E94\uFF08\u6839\u9664\u5355\u5B57\u7AD6\u6392\u6587\u5B57\u622A\u65AD\uFF09
     \u53EA\u4F5C\u7528\u4E8E\u627F\u8F7D\u6587\u672C\u7684\u5143\u7D20\uFF1A\u4EE3\u7801\u5757 / \u8F93\u5165\u6846\u5FC5\u987B\u4FDD\u6301\u539F\u59CB\u7A7A\u767D\u8BED\u4E49
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

  /* \u901A\u7528\u8BBE\u7F6E\u533A\u3001\u6A21\u578B\u8BBE\u7F6E\u533A\u3001\u63D2\u4EF6\u8BBE\u7F6E\u533A\u5BBD\u5EA6 100% \u5C55\u5F00 */
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

  /* \u8BBE\u7F6E\u9879\u6BCF\u4E00\u884C\uFF08\u4F8B\u5982\u5F00\u53D1\u8005\u89C6\u56FE\u5F00\u5173\u3001\u8BED\u8A00\u5207\u6362\u3001\u7248\u672C\u4FE1\u606F\uFF09\u6539\u4E3A\u7EB5\u5411\u4E24\u7EA7 */
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

  /* \u884C\u5185\u64CD\u4F5C\u5F00\u5173\u548C\u6309\u94AE\u79FB\u81F3\u4E0B\u65B9\u5168\u5BBD\u6216\u81EA\u7136\u53F3\u5BF9\u9F50 */
  .Pt1bsG_row > button,
  .Pt1bsG_row > div:last-child {
    align-self: flex-start !important;
  }

  /* \u4E3B\u9898\u6A21\u5F0F 3 \u4E2A\u65B9\u5757\u9009\u62E9\u5668\uFF08\u6D45\u8272/\u6DF1\u8272/\u8DDF\u968F\u7CFB\u7EDF\uFF09\u6539\u4E3A 3 \u5217\u7B49\u5BBD\u6805\u683C */
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

  /* \u6A21\u578B\u5361\u7247\u4E0E\u9884\u8BBE\u9009\u9879 */
  .zGbnIq_rows,
  .rtSEdW_cards {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
  }
}
`;
var composerCss = `
/* ==========================================================================
   dsh-pocket-mobile: \u79FB\u52A8\u7AEF\u8F93\u5165\u6846\uFF08Composer\uFF09\u4E0E\u63A7\u5236\u680F\u4F18\u5316
   \u7531\u914D\u7F6E\u5F00\u5173\u300C\u8F93\u5165\u6846\u89E6\u5C4F\u4E0E\u5360\u4F4D\u7B26\u5B8C\u6574\u663E\u793A\u300D\u63A7\u5236\u662F\u5426\u6CE8\u5165\u672C\u6BB5
   ========================================================================== */

@media (max-width: 1023px) {
  /* \u8F93\u5165\u6846\u5916\u5C42\u5BB9\u5668\uFF1A\u6536\u7F29\u4E24\u4FA7\u591A\u4F59\u95F4\u8DDD\uFF0C\u9002\u914D\u5C0F\u5C4F */
  .uV2eYG_root {
    padding: 0 8px 6px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  /* \u8F93\u5165\u6846\u5361\u7247\u4E3B\u4F53 */
  .uV2eYG_card {
    border-radius: var(--dsw-radius-xl, 16px) !important;
    padding-top: 6px !important;
    gap: 8px !important;
    max-width: 100% !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08) !important;
  }

  /* \u7F16\u8F91\u6587\u672C\u533A\uFF1A\u5B57\u53F7 15px \u907F\u514D iOS \u5524\u8D77\u865A\u62DF\u952E\u76D8\u65F6\u9875\u9762\u81EA\u52A8\u653E\u5927 */
  .uV2eYG_input {
    min-height: 38px !important;
    font-size: 15px !important;
    line-height: 22px !important;
    padding: 4px 8px 0 10px !important;
    -webkit-user-select: text !important;
  }

  /* \u5F7B\u5E95\u89E3\u51B3\u5360\u4F4D\u7B26\u622A\u65AD\u95EE\u9898\uFF1A\u5141\u8BB8\u6298\u884C\u663E\u793A\u6700\u591A 2 \u884C */
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

  /* \u5E95\u90E8\u64CD\u4F5C\u884C */
  .uV2eYG_row {
    padding: 2px 6px 6px !important;
    gap: 6px !important;
    align-items: center !important;
    justify-content: space-between !important;
    flex-wrap: nowrap !important;
    min-width: 0 !important;
  }

  /* \u5DE6\u4FA7\u64CD\u4F5C\u7EC4\uFF1A\u52A0\u53F7\u3001\u6743\u9650\u3001\u8BA1\u5212 */
  .uV2eYG_tools {
    gap: 6px !important;
    flex-shrink: 0 !important;
    min-width: 0 !important;
  }

  /* \u52A0\u53F7\u6309\u94AE\uFF08\u9644\u4EF6\u4E0E\u5FEB\u6377\u6307\u4EE4\uFF09\u89E6\u6478\u70ED\u533A\u653E\u5927 */
  .uV2eYG_add {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    border-radius: 50% !important;
  }

  .uV2eYG_modes {
    gap: 4px !important;
  }

  /* \u53F3\u4FA7\u64CD\u4F5C\u7EC4\uFF1A\u6A21\u578B\u9009\u62E9\u3001\u6D3B\u52A8\u72B6\u6001\u3001\u53D1\u9001\u6309\u94AE */
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

  /* \u6A21\u578B\u9009\u62E9\u5668\u89E6\u53D1\u6309\u94AE\uFF08ModelSelect\uFF09\uFF1A\u7CBE\u7B80\u5C3A\u5BF8\u4E0E\u5B57\u53F7 */
  ._7KE1Ra_trigger {
    height: 32px !important;
    max-width: min(160px, 38vw) !important;
    padding: 0 6px !important;
    font-size: 12px !important;
    border-radius: var(--dsw-radius-md, 8px) !important;
    background: var(--dsw-alias-fill-tsp-secondary, rgba(255, 255, 255, 0.05)) !important;
    gap: 3px !important;
  }

  /* \u6A21\u578B\u540D\u79F0\u81EA\u9002\u5E94\u622A\u65AD */
  ._7KE1Ra_triggerLabel {
    font-size: 12px !important;
    max-width: 100px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
  }

  /* \u6A21\u578B\u4E0B\u62C9\u6D6E\u52A8\u83DC\u5355\uFF08\u6846\u67B6\u91CC\u5DF2\u662F position:fixed\uFF09\uFF1A\u79FB\u52A8\u7AEF\u62AC\u5230\u62C7\u6307\u53EF\u53CA\u5904\u3002
     z-index \u4FDD\u6301\u4F4E\u4E8E\u8BBE\u7F6E\u5F39\u7A97\uFF081300\uFF09\u4E0E\u4FA7\u8FB9\u680F\uFF081250\uFF09\uFF0C\u9AD8\u4E8E Menu portal\uFF081100\uFF09\u3002

     top: auto \u662F\u5FC5\u9700\u7684\uFF0C\u4E0D\u662F\u4FDD\u9669\uFF1A\u6846\u67B6\u7528 inline style \u5B9A\u4F4D\u8FD9\u4E2A\u6D6E\u5C42
     \uFF08ModelSelect \u7684 place() \u2192 setMenuPos({left, top})\uFF0C\u6D4B\u91CF\u671F\u662F
     MEASURE_STYLE{visibility:hidden,left:0,top:0}\uFF09\uFF0C\u53EA\u8986\u76D6 left/bottom \u65F6
     inline \u7684 top \u4ECD\u7136\u751F\u6548\u3002\u800C position:fixed \u7684\u76D2\u5B50\u5728 top \u4E0E bottom \u90FD\u975E auto\u3001
     height:auto \u65F6\u4F1A\u6309 CSS 2.1 \xA710.6.4 \u628A\u9AD8\u5EA6\u89E3\u6210\u300C\u4E24\u7AEF\u4E4B\u95F4\u586B\u6EE1\u300D\uFF0C\u518D\u88AB\u4E0B\u9762\u7684
     max-height \u622A\u4F4F \u2014\u2014 \u4E8E\u662F\u53EA\u6709\u300C\u6A21\u578B / \u601D\u8003\u5F3A\u5EA6\u300D\u4E24\u884C\u7684\u6839\u83DC\u5355\u88AB\u62C9\u6210 428px\u3002
     \u538B\u6389 top \u4E4B\u540E\u6839\u83DC\u5355\u56DE\u5230\u5185\u5BB9\u9AD8\u5EA6\uFF08\u4E24\u884C \u2248 76px\uFF0C\u5B9E\u6D4B\uFF09\uFF0C\u53EA\u6709\u8FDB\u5165\u6A21\u578B\u5B50\u9875
     \uFF08\u641C\u7D22 + \u5217\u8868\uFF09\u624D\u957F\u5230 max-height \u5E76\u5185\u90E8\u6EDA\u52A8\uFF0C\u8FD9\u6B63\u662F\u6211\u4EEC\u8981\u7684\u5206\u5BF8\u3002 */
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

  /* \u53D1\u9001\u6309\u94AE\uFF08Primary Action\uFF09\uFF1A\u62C7\u6307\u76F2\u64CD\u5927\u70ED\u533A */
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

  /* \u5E95\u90E8\u8F85\u52A9 Token \u6307\u793A\u5668\u680F */
  .uV2eYG_dock {
    padding-top: 2px !important;
    gap: 8px !important;
  }

  /* \u5FEB\u6377\u6307\u4EE4 / \u659C\u6760\u83DC\u5355\uFF1A\u771F\u5B9E\u94A9\u5B50\u662F data-trigger-menu\uFF08\u6846\u67B6\u7684
     ._3e4SsG_menu \u5DF2\u81EA\u6491\u6EE1 composer \u5361\u7247\u5BBD\u5EA6\uFF09\uFF0C\u8FD9\u91CC\u53EA\u9650\u5236\u9AD8\u5EA6\u4E0D\u6EA2\u51FA\u952E\u76D8\u3002 */
  [data-trigger-menu] {
    max-height: min(400px, 45dvh) !important;
  }
}
`;
var planCss = `
/* ==========================================================================
   dsh-pocket-mobile: Plan \u6A21\u5F0F\u3001\u63D0\u95EE\u4EA4\u4E92\u4E0E\u5BA1\u6279\u9762\u677F\u79FB\u52A8\u7AEF\u54CD\u5E94\u5F0F\u6837\u5F0F
   ========================================================================== */

@media (max-width: 1023px) {
  /* ------------------------------------------------------------------------
     1. PlanReviewPanel\uFF1A\u8BA1\u5212\u5F85\u5BA1\u63A5\u7BA1\u9762\u677F
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

  /* \u9876\u90E8\u9EC4\u8272\u72B6\u6001\u6761 */
  .LVzXQa_strip {
    padding: 10px 12px !important;
    font-size: 13px !important;
  }

  .LVzXQa_previewActions {
    margin-left: auto !important;
  }

  /* \u300C\u67E5\u770B\u5168\u6587\u300D\u94FE\u63A5\u6309\u94AE\u89E6\u6478\u70ED\u533A\u653E\u5927 */
  .k74WwW_reviewLink {
    padding: 4px 8px !important;
    font-size: 12px !important;
    min-height: 28px !important;
  }

  /* \u6458\u8981\u533A\u57DF */
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

  /* \u5E95\u90E8\u64CD\u4F5C\u884C\uFF1A\u5168\u5BBD\u53CC\u5217\u7F51\u683C\u6309\u94AE */
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
     2. QuestionComposer\uFF1A\u7528\u6237\u63D0\u95EE\u5361\u7247\uFF08\u591A\u9009\u3001\u5355\u9009\u3001\u81EA\u5B9A\u4E49\u56DE\u7B54\uFF09
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
     3. ApprovalPanel\uFF1A\u5DE5\u5177\u8D8A\u6743\u5BA1\u6279\u5361\u7247
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
     4. \u5BF9\u8BDD\u6D41\u4E2D\u7684 PlanCard \u4E0E\u6587\u4EF6\u5361\u7247
     ------------------------------------------------------------------------ */
  .k74WwW_card,
  .nyYjTG_file {
    width: 100% !important;
    min-height: 52px !important;
    border-radius: var(--dsw-radius-lg, 12px) !important;
  }

  /* \u53F3\u4FA7\u8FB9\u680F\u5168\u5C4F\u8BA1\u5212\u6587\u6863\u9605\u8BFB\uFF08PlanPreview\uFF09 */
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
var touchCss = `
/* ==========================================================================
   dsh-pocket-mobile: \u79FB\u52A8\u7AEF\u89E6\u63A7\u53CD\u9988\u3001\u5B89\u5168\u533A\u57DF\u4E0E\u5BF9\u8BDD\u6D41\u4F18\u5316
   ========================================================================== */

@media (max-width: 1023px) {
  /* \u5168\u5C40\u79FB\u52A8\u7AEF CSS \u53D8\u91CF\u8986\u5199 */
  :root,
  body {
    --dsh-composer-side-clearance: 8px !important;
    --dsh-chat-side-clearance: 12px !important;
    --dsh-scrollbar-width: 3px !important;
    -webkit-tap-highlight-color: transparent !important;
    overscroll-behavior-y: none !important;
  }

  /* \u4EA4\u4E92\u5143\u7D20\u542F\u7528\u5FEB\u901F\u89E6\u6478\u54CD\u5E94\uFF0C\u6D88\u9664 300ms \u5EF6\u8FDF */
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

  /* \u5E95\u90E8\u5218\u6D77\u5C4F / Home Indicator \u5B89\u5168\u8DDD\u79BB\u8865\u507F */
  .uV2eYG_root,
  .LVzXQa_frame,
  .Mbwy4a_frame,
  .mna1RW_root {
    padding-bottom: max(6px, env(safe-area-inset-bottom, 6px)) !important;
  }

  /* \u4F1A\u8BDD Header \u91CC\u7684\u6C49\u5821\u62BD\u5C49\u6309\u94AE\uFF08\u6CE8\u518C\u5728 conversation.header.leading\uFF09 */
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

  /* \u5BF9\u8BDD\u6D41\u4EE3\u7801\u5757\u4E0E\u8868\u683C\u5728\u7A84\u5C4F\u4E0A\u9632\u6491\u7834 */
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

/* \u684C\u9762\u7AEF\u9690\u85CF\u79FB\u52A8\u7AEF\u4E13\u5C5E\u63A7\u4EF6\uFF08\u4E0E MOBILE_BREAKPOINT = 1024 \u5BF9\u9F50\uFF09 */
@media (min-width: 1024px) {
  #dsh-mobile-drawer-toggle,
  #dsh-mobile-sidebar-backdrop,
  .dsh-mobile-settings-back-bar {
    display: none !important;
  }
}
`;

// mobile/client/responsive-shell.js
var MOBILE_BREAKPOINT = 1024;
var MOBILE_PREF_KEY = "dsh_pocket_mobile_prefs";
var DEFAULT_PREFS = Object.freeze({
  drawerBackdrop: true,
  compactComposer: true,
  stepSettings: true
});
var SESSION_ROW_SELECTOR = '[data-row-key^="session:"]';
var ROW_CONTROL_SELECTOR = 'button, a[href], input, textarea, select, [role="menuitem"], [role="button"], [role="tab"]';
var ROW_CLOSE_DELAY_MS = 120;
var AUTO_CLOSE_DEDUPE_MS = 240;
var CENTER_COL_SELECTOR = ".pI_x6G_centerCol";
var MAIN_ANCHOR_SELECTOR = '[data-slot="main"]';
var CONVERSATION_MARKER_SELECTOR = "[data-conversation-content]";
var CONVERSATION_SESSION_ATTR = "data-conversation-session";
var currentPrefs = { ...DEFAULT_PREFS };
function readMobilePrefs() {
  return { ...currentPrefs };
}
function isMobileViewport(width = typeof window !== "undefined" ? window.innerWidth : MOBILE_BREAKPOINT) {
  return width < MOBILE_BREAKPOINT;
}
function mobileCss(prefs = currentPrefs) {
  return [
    shellCss,
    settingsCss,
    prefs.compactComposer === false ? "" : composerCss,
    planCss,
    touchCss
  ].filter((part) => part !== "").join("\n\n");
}
function injectMobileStyles(doc = document, prefs = currentPrefs) {
  const tagId = "dsh-pocket-mobile/styles";
  let styleEl = doc.querySelector(`style[data-plugin-css="${tagId}"]`);
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.dataset.plugin = "dsh-pocket-mobile";
    styleEl.dataset.pluginCss = tagId;
    doc.head.appendChild(styleEl);
  }
  styleEl.textContent = mobileCss(prefs);
  return () => {
    styleEl?.remove();
  };
}
function applyMobilePrefs(prefs, doc = document) {
  currentPrefs = { ...DEFAULT_PREFS, ...prefs ?? {} };
  if (doc?.documentElement) {
    doc.documentElement.dataset.dshMobileBackdrop = currentPrefs.drawerBackdrop === false ? "off" : "on";
  }
  injectMobileStyles(doc, currentPrefs);
  return readMobilePrefs();
}
function drawerFrame(doc = document) {
  return doc.querySelector(".pI_x6G_frame");
}
function isDrawerCollapsed(doc = document) {
  const frame = drawerFrame(doc);
  return frame === null ? true : frame.hasAttribute("data-sidebar-collapsed");
}
function setDrawerOpen(ctx, open, doc = document) {
  if (open === !isDrawerCollapsed(doc)) return false;
  const toggle = ctx?.layout?.toggleSidebar;
  if (typeof toggle !== "function") return false;
  toggle.call(ctx.layout);
  return true;
}
function openDrawer(ctx, doc = document) {
  return setDrawerOpen(ctx, true, doc);
}
function closeDrawer(ctx, doc = document) {
  return setDrawerOpen(ctx, false, doc);
}
function mainViewIdentity(doc = document) {
  const center = doc?.querySelector?.(CENTER_COL_SELECTOR);
  if (!center || typeof center.querySelector !== "function") return "";
  const conversation = center.querySelector(CONVERSATION_MARKER_SELECTOR);
  if (conversation) {
    const sessionId = typeof conversation.getAttribute === "function" ? conversation.getAttribute(CONVERSATION_SESSION_ATTR) : null;
    return `conversation:${sessionId ?? ""}`;
  }
  const anchor = center.querySelector(MAIN_ANCHOR_SELECTOR);
  const occupant = anchor?.firstElementChild ?? null;
  if (occupant === null) return "";
  return `panel:${occupant.className ?? ""}`;
}
function installResponsiveShell(ctx, doc = document) {
  if (typeof window === "undefined") return () => {
  };
  const cleanupStyles = injectMobileStyles(doc, currentPrefs);
  let backdrop = doc.getElementById("dsh-mobile-sidebar-backdrop");
  if (!backdrop) {
    backdrop = doc.createElement("div");
    backdrop.id = "dsh-mobile-sidebar-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    doc.body.appendChild(backdrop);
  }
  const onBackdropClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDrawer(ctx, doc);
  };
  backdrop.addEventListener("click", onBackdropClick);
  let syncQueued = false;
  const requestSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    const run = () => {
      syncQueued = false;
      syncSidebarState();
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  };
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
      attributeFilter: ["data-sidebar-collapsed"]
    });
  };
  let viewObserver = null;
  let viewBaseline = "";
  let viewSynced = false;
  let viewQueued = false;
  let lastAutoCloseAt = 0;
  const requestAutoClose = () => {
    const now = Date.now();
    if (now - lastAutoCloseAt < AUTO_CLOSE_DEDUPE_MS) return;
    lastAutoCloseAt = now;
    closeDrawer(ctx, doc);
  };
  const viewTargets = () => {
    const center = doc.querySelector(CENTER_COL_SELECTOR);
    if (!center || typeof center.querySelector !== "function") return null;
    return {
      anchor: center.querySelector(MAIN_ANCHOR_SELECTOR) ?? center,
      conversation: center.querySelector(CONVERSATION_MARKER_SELECTOR)
    };
  };
  const observeViewTargets = () => {
    const targets = viewTargets();
    if (targets === null || viewObserver === null) return;
    viewObserver.observe(targets.anchor, { childList: true });
    if (targets.conversation) {
      viewObserver.observe(targets.conversation, {
        attributes: true,
        attributeFilter: [CONVERSATION_SESSION_ATTR]
      });
    }
  };
  const retargetViewWatch = () => {
    if (viewObserver === null) return;
    viewObserver.disconnect();
    observeViewTargets();
  };
  const checkView = () => {
    const next = mainViewIdentity(doc);
    if (next === "") return;
    if (!viewSynced) {
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
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  };
  const attachViewWatch = () => {
    if (viewObserver !== null) return;
    if (viewTargets() === null) return;
    viewObserver = new MutationObserver((records) => {
      if (records.some((record) => record.type === "childList")) retargetViewWatch();
      requestViewCheck();
    });
    const initial = mainViewIdentity(doc);
    viewSynced = initial !== "";
    viewBaseline = initial;
    lastAutoCloseAt = 0;
    observeViewTargets();
  };
  const detachViewWatch = () => {
    viewObserver?.disconnect();
    viewObserver = null;
    viewBaseline = "";
    viewSynced = false;
  };
  const syncSidebarState = () => {
    ensureFrameObserver();
    if (!isMobileViewport(window.innerWidth)) {
      backdrop?.classList.remove("active");
      detachViewWatch();
      return;
    }
    const open = !isDrawerCollapsed(doc);
    backdrop?.classList.toggle("active", open);
    if (open) attachViewWatch();
    else detachViewWatch();
  };
  const updateMobileState = () => {
    if (isMobileViewport(window.innerWidth)) doc.documentElement.setAttribute("data-dsh-mobile", "true");
    else doc.documentElement.removeAttribute("data-dsh-mobile");
    requestSync();
  };
  window.addEventListener("resize", updateMobileState);
  window.addEventListener("orientationchange", updateMobileState);
  if (drawerFrame(doc) === null && typeof MutationObserver === "function") {
    bootObserver = new MutationObserver(requestSync);
    bootObserver.observe(doc.body, { childList: true, subtree: true });
  }
  const onDocumentClick = (e) => {
    if (!isMobileViewport(window.innerWidth)) return;
    const target = e.target;
    if (!target || typeof target.closest !== "function") return;
    if (isDrawerCollapsed(doc)) return;
    if (target.closest(".pI_x6G_sidebarCol") === null) return;
    if (target.closest(SESSION_ROW_SELECTOR) === null) return;
    if (target.closest(ROW_CONTROL_SELECTOR) !== null) return;
    setTimeout(() => {
      if (!isDrawerCollapsed(doc)) requestAutoClose();
    }, ROW_CLOSE_DELAY_MS);
  };
  doc.addEventListener("click", onDocumentClick, true);
  updateMobileState();
  syncSidebarState();
  return () => {
    window.removeEventListener("resize", updateMobileState);
    window.removeEventListener("orientationchange", updateMobileState);
    backdrop?.removeEventListener("click", onBackdropClick);
    backdrop?.remove();
    doc.removeEventListener("click", onDocumentClick, true);
    bootObserver?.disconnect();
    frameObserver?.disconnect();
    detachViewWatch();
    syncQueued = false;
    viewQueued = false;
    cleanupStyles();
    doc.documentElement.removeAttribute("data-dsh-mobile");
    delete doc.documentElement.dataset.dshMobileBackdrop;
  };
}

// mobile/client/settings-adapter.js
var BACK_BAR_CLASS = "dsh-mobile-settings-back-bar";
function installSettingsAdapter(doc = document) {
  if (typeof window === "undefined") return () => {
  };
  const initializedPanels = /* @__PURE__ */ new WeakSet();
  const boundNavs = /* @__PURE__ */ new WeakSet();
  const ensureBackBar = (panel, options) => {
    if (options.querySelector(`.${BACK_BAR_CLASS}`)) return;
    const backBar = doc.createElement("button");
    backBar.type = "button";
    backBar.className = BACK_BAR_CLASS;
    backBar.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13L5 8L10 3"></path></svg><span>\u8FD4\u56DE\u8BBE\u7F6E</span>';
    backBar.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      panel.setAttribute("data-mobile-settings-view", "root");
    });
    options.appendChild(backBar);
  };
  const handleSettingsPanel = (panel) => {
    if (!isMobileViewport(window.innerWidth)) {
      panel.removeAttribute("data-mobile-settings-view");
      return;
    }
    if (readMobilePrefs().stepSettings === false) {
      panel.removeAttribute("data-mobile-settings-view");
      panel.querySelector(`.${BACK_BAR_CLASS}`)?.remove();
      return;
    }
    if (!initializedPanels.has(panel)) {
      initializedPanels.add(panel);
      panel.setAttribute("data-mobile-settings-view", "root");
    }
    const options = panel.querySelector(".VOzbGW_options");
    if (options) ensureBackBar(panel, options);
    const nav = panel.querySelector(".VOzbGW_nav");
    if (nav && !boundNavs.has(nav)) {
      boundNavs.add(nav);
      nav.addEventListener("click", (event) => {
        const target = event.target;
        if (target && typeof target.closest === "function" && target.closest('button, [role="tab"]')) {
          panel.setAttribute("data-mobile-settings-view", "detail");
        }
      });
    }
  };
  const syncSettings = () => {
    doc.querySelectorAll(".VOzbGW_panel").forEach(handleSettingsPanel);
  };
  let queued = false;
  const requestSync = () => {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      syncSettings();
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  };
  const observer = new MutationObserver(requestSync);
  observer.observe(doc.body, {
    childList: true,
    subtree: true
  });
  window.addEventListener("resize", requestSync);
  syncSettings();
  return () => {
    queued = false;
    observer.disconnect();
    window.removeEventListener("resize", requestSync);
  };
}

// mobile/client/index.jsx
var name = "dsh-pocket-mobile";
var inject = ["slots", "layout"];
function loadPrefs() {
  const fallback = { ...DEFAULT_PREFS };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(MOBILE_PREF_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function savePrefs(prefs) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MOBILE_PREF_KEY, JSON.stringify(prefs));
  } catch {
  }
}
function DrawerToggleButton({ onClick }) {
  return (0, import_react.createElement)(
    "button",
    {
      type: "button",
      id: "dsh-mobile-drawer-toggle",
      className: "dsh-mobile-drawer-toggle",
      "aria-label": "\u5207\u6362\u4FA7\u8FB9\u680F\u83DC\u5355",
      onClick
    },
    (0, import_react.createElement)(
      "svg",
      {
        width: 20,
        height: 20,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true"
      },
      (0, import_react.createElement)("line", { key: "top", x1: 3, y1: 6, x2: 21, y2: 6 }),
      (0, import_react.createElement)("line", { key: "mid", x1: 3, y1: 12, x2: 21, y2: 12 }),
      (0, import_react.createElement)("line", { key: "bottom", x1: 3, y1: 18, x2: 21, y2: 18 })
    )
  );
}
function useMobileViewport() {
  const [mobile, setMobile] = (0, import_react.useState)(() => isMobileViewport());
  (0, import_react.useEffect)(() => {
    const sync = () => setMobile(isMobileViewport());
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);
  return mobile;
}
var ABSENT_PANEL_INFO = {
  getSnapshot: () => null,
  subscribe: () => () => {
  }
};
function MobilePanelExit({ onExit, panelInfo }) {
  const mobile = useMobileViewport();
  const usable = typeof panelInfo?.getSnapshot === "function" && typeof panelInfo?.subscribe === "function";
  const source = usable ? panelInfo : ABSENT_PANEL_INFO;
  const activePanelId = (0, import_react.useSyncExternalStore)(
    (listener) => source.subscribe(listener),
    () => source.getSnapshot()?.activePanelId ?? null
  );
  const visible = mobile && activePanelId !== null;
  (0, import_react.useEffect)(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-dsh-mobile-panel", "true");
    else root.removeAttribute("data-dsh-mobile-panel");
    return () => root.removeAttribute("data-dsh-mobile-panel");
  }, [visible]);
  if (!visible) return null;
  return (0, import_react.createElement)(
    "button",
    {
      type: "button",
      id: "dsh-mobile-panel-exit",
      className: "dsh-mobile-panel-exit",
      "aria-label": "\u8FD4\u56DE\u4F1A\u8BDD",
      onClick: onExit
    },
    (0, import_react.createElement)(
      "svg",
      {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true"
      },
      (0, import_react.createElement)("line", { key: "shaft", x1: 20, y1: 12, x2: 5, y2: 12 }),
      (0, import_react.createElement)("polyline", { key: "head", points: "11 6 5 12 11 18" })
    ),
    "\u8FD4\u56DE\u4F1A\u8BDD"
  );
}
function MobileConfigPage() {
  const [prefs, setPrefs] = (0, import_react.useState)(loadPrefs);
  const [saved, setSaved] = (0, import_react.useState)(false);
  const firstRun = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    if (firstRun.current) {
      firstRun.current = false;
      applyMobilePrefs(prefs);
      return void 0;
    }
    savePrefs(prefs);
    applyMobilePrefs(prefs);
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2e3);
    return () => clearTimeout(timer);
  }, [prefs]);
  (0, import_react.useEffect)(() => {
    if (typeof window === "undefined") return void 0;
    const onStorage = (event) => {
      if (event.key !== MOBILE_PREF_KEY || event.newValue === null) return;
      try {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(event.newValue) });
      } catch {
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const toggle = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  return (0, import_react.createElement)(
    "div",
    {
      style: {
        padding: "16px 20px 40px",
        maxWidth: 640,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        color: "var(--dsw-alias-label-primary)",
        fontFamily: "inherit"
      }
    },
    // 标题与说明
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 6 } },
      (0, import_react.createElement)("h3", { style: { margin: 0, fontSize: 18, fontWeight: 600 } }, "\u624B\u673A\u7AEF WebUI \u4F53\u9A8C\u589E\u5F3A"),
      (0, import_react.createElement)(
        "p",
        { style: { margin: 0, fontSize: 13, color: "var(--dsw-alias-label-tertiary)", lineHeight: 1.5 } },
        "\u5DF2\u542F\u7528\u9488\u5BF9\u624B\u673A\u89E6\u5C4F\u4E0E\u7A84\u5C4F\u89C6\u53E3\u7684\u6DF1\u5EA6\u81EA\u9002\u5E94\u4F18\u5316\uFF0C\u8986\u76D6\u4FA7\u8FB9\u680F\u62BD\u5C49\u3001\u8BBE\u7F6E\u4E24\u7EA7\u5BFC\u822A\u3001\u89E6\u5C4F\u8F93\u5165\u6846\u53CA Plan \u5BA1\u9605\u5361\u7247\u3002"
      )
    ),
    // 状态特性列表
    (0, import_react.createElement)(
      "div",
      {
        style: {
          background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.04))",
          border: "1px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.08))",
          borderRadius: 12,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12
        }
      },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500 } },
        (0, import_react.createElement)("span", { style: { color: "var(--dsw-alias-state-success-primary, #10b981)" } }, "\u25CF"),
        "\u6838\u5FC3\u589E\u5F3A\u5DF2\u751F\u6548",
        saved ? (0, import_react.createElement)("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)", marginLeft: "auto" } }, "\u8BBE\u7F6E\u5DF2\u66F4\u65B0") : null
      ),
      (0, import_react.createElement)(
        "ul",
        {
          style: {
            margin: 0,
            paddingLeft: 20,
            fontSize: 13,
            lineHeight: 1.7,
            color: "var(--dsw-alias-label-secondary)"
          }
        },
        (0, import_react.createElement)("li", null, "\u62BD\u5C49\u5F0F\u5DE6\u4FA7\u680F\uFF1A\u4E3B\u5BF9\u8BDD\u680F\u59CB\u7EC8\u94FA\u6EE1\u6574\u5C4F\uFF0C\u5C55\u5F00\u65F6\u4EE5\u62BD\u5C49\u6D6E\u51FA\u800C\u4E0D\u6324\u538B\u5185\u5BB9"),
        (0, import_react.createElement)("li", null, "\u5168\u5C40\u9762\u677F\u8FD4\u56DE\u952E\uFF1A\u63D2\u4EF6 / \u5B9A\u65F6\u4EFB\u52A1\u9875\u5DE6\u4E0A\u89D2\u4E00\u952E\u56DE\u5230\u4F1A\u8BDD\uFF0C\u4E0D\u518D\u88AB\u56F0\u5728\u9762\u677F\u91CC"),
        (0, import_react.createElement)("li", null, "\u4E24\u7EA7\u8BBE\u7F6E\u5BFC\u822A\uFF1A\u6D88\u9664\u5C0F\u5C4F\u5DE6\u53F3\u5E76\u6392\u6324\u538B\u5BFC\u81F4\u4E2D\u6587\u5355\u4E2A\u5B57\u7AD6\u5411\u6298\u884C\uFF0C\u652F\u6301\u4E00\u952E\u8FD4\u56DE"),
        (0, import_react.createElement)("li", null, "\u8F93\u5165\u6846\u9632\u622A\u65AD\uFF1A\u5B8C\u6574\u5C55\u793A\u591A\u884C\u63D0\u793A\u8BCD\uFF0C\u653E\u5927\u5E95\u90E8\u53D1\u9001\u4E0E\u529F\u80FD\u6309\u94AE\u89E6\u63A7\u70ED\u533A"),
        (0, import_react.createElement)("li", null, "Plan \u6A21\u5F0F\u4E0E\u5BA1\u6279\u4F18\u5316\uFF1A\u5168\u5C4F\u6C89\u6D78\u5F0F\u8BA1\u5212\u9884\u89C8\uFF0C\u5E95\u90E8\u5927\u6309\u94AE\u9632\u6B62\u8BEF\u89E6\u4E0E\u5C0F\u5C4F\u6EA2\u51FA")
      )
    ),
    // 开关选项组
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 12 } },
      (0, import_react.createElement)("h4", { style: { margin: "8px 0 0", fontSize: 14, fontWeight: 600 } }, "\u529F\u80FD\u5FAE\u8C03\u9009\u9879"),
      // 选项 1
      (0, import_react.createElement)(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "var(--dsw-alias-bg-layer-1)",
            border: "0.5px solid var(--dsw-alias-border-l2)",
            borderRadius: 10,
            cursor: "pointer"
          }
        },
        (0, import_react.createElement)(
          "span",
          { style: { display: "flex", flexDirection: "column", gap: 2 } },
          (0, import_react.createElement)("span", { style: { fontSize: 14, fontWeight: 500 } }, "\u62BD\u5C49\u4FA7\u8FB9\u680F\u906E\u7F69\u4E0E\u70B9\u51FB\u6536\u8D77"),
          (0, import_react.createElement)(
            "span",
            { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } },
            "\u5C55\u5F00\u4FA7\u680F\u65F6\u5448\u73B0\u534A\u900F\u660E\u80CC\u666F\u5E76\u5141\u8BB8\u70B9\u51FB\u5173\u95ED\uFF1B\u5173\u95ED\u540E\u53EA\u80FD\u9760\u4F1A\u8BDD/\u5DE5\u4F5C\u533A\u884C\u81EA\u52A8\u6536\u8D77"
          )
        ),
        (0, import_react.createElement)("input", {
          type: "checkbox",
          checked: prefs.drawerBackdrop,
          onChange: () => toggle("drawerBackdrop"),
          style: { width: 18, height: 18, cursor: "pointer" }
        })
      ),
      // 选项 2
      (0, import_react.createElement)(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "var(--dsw-alias-bg-layer-1)",
            border: "0.5px solid var(--dsw-alias-border-l2)",
            borderRadius: 10,
            cursor: "pointer"
          }
        },
        (0, import_react.createElement)(
          "span",
          { style: { display: "flex", flexDirection: "column", gap: 2 } },
          (0, import_react.createElement)("span", { style: { fontSize: 14, fontWeight: 500 } }, "\u8F93\u5165\u6846\u89E6\u5C4F\u4E0E\u5360\u4F4D\u7B26\u5B8C\u6574\u663E\u793A"),
          (0, import_react.createElement)(
            "span",
            { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } },
            "\u5360\u4F4D\u6587\u5B57\u6298\u884C\u3001\u53D1\u9001\u4E0E\u9644\u4EF6\u6309\u94AE\u653E\u5927\u70ED\u533A\u3001\u6A21\u578B\u83DC\u5355\u6539\u4E3A\u5E95\u90E8\u6D6E\u5C42"
          )
        ),
        (0, import_react.createElement)("input", {
          type: "checkbox",
          checked: prefs.compactComposer,
          onChange: () => toggle("compactComposer"),
          style: { width: 18, height: 18, cursor: "pointer" }
        })
      ),
      // 选项 3
      (0, import_react.createElement)(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "var(--dsw-alias-bg-layer-1)",
            border: "0.5px solid var(--dsw-alias-border-l2)",
            borderRadius: 10,
            cursor: "pointer"
          }
        },
        (0, import_react.createElement)(
          "span",
          { style: { display: "flex", flexDirection: "column", gap: 2 } },
          (0, import_react.createElement)("span", { style: { fontSize: 14, fontWeight: 500 } }, "\u79FB\u52A8\u7AEF\u8BBE\u7F6E\u9762\u677F\u5206\u6B65\u4E0B\u94BB\u5BFC\u822A"),
          (0, import_react.createElement)(
            "span",
            { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } },
            "\u76EE\u5F55\u4E0E\u8BE6\u60C5\u4E24\u7EA7\u5C55\u793A\uFF0C\u6839\u9664\u5B57\u7AD6\u6392\u6324\u538B\uFF1B\u5173\u95ED\u540E\u5206\u7C7B\u5217\u8868\u4E0E\u5185\u5BB9\u6539\u5728\u540C\u4E00\u9875\u7EB5\u5411\u6392\u5217\uFF0C\u4E0D\u505A\u4E0B\u94BB"
          )
        ),
        (0, import_react.createElement)("input", {
          type: "checkbox",
          checked: prefs.stepSettings,
          onChange: () => toggle("stepSettings"),
          style: { width: 18, height: 18, cursor: "pointer" }
        })
      )
    )
  );
}
function apply(ctx) {
  applyMobilePrefs(loadPrefs());
  const disposeShell = installResponsiveShell(ctx);
  ctx.effect(() => disposeShell, "dsh-pocket-mobile: responsive shell");
  const disposeSettings = installSettingsAdapter();
  ctx.effect(() => disposeSettings, "dsh-pocket-mobile: settings adapter");
  function MobileDrawerToggle() {
    if (!useMobileViewport()) return null;
    return (0, import_react.createElement)(DrawerToggleButton, { onClick: () => openDrawer(ctx) });
  }
  ctx.slots.inject(
    "conversation.header.leading",
    () => ctx.slots.register({ name: "conversation.header.leading" }, MobileDrawerToggle)
  );
  ctx.slots.inject(
    "shell.overlay",
    () => ctx.slots.register(
      {
        name: "shell.overlay",
        id: "dsh-pocket-mobile#panel-exit",
        inject: () => ({
          onExit: () => ctx.layout.selectPanel(null),
          panelInfo: ctx.layout.panelInfo
        })
      },
      MobilePanelExit
    )
  );
  ctx.slots.inject(
    "plugins.row.config",
    () => ctx.slots.register(
      {
        name: "plugins.row.config",
        key: "dsh-pocket#dsh-pocket-mobile"
      },
      MobileConfigPage
    )
  );
}

    return module.exports;
  }
});
