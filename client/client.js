window.__ModuleLoader__.load({
  id: "dsh-pocket",
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

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  applyRemote: () => applyRemote,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");

// client/api.js
var POCKET_RPC_CHANNEL = "/dsh-pocket";
var POCKET_ENDPOINTS = Object.freeze({
  status: "pocket.status",
  version: "pocket.version",
  update: "pocket.update",
  restart: "pocket.restart",
  pocketReset: "pocket.reset",
  // OAuth 管理（loopback-only RPC 通道内调用）
  oauthRotateSession: "oauth.rotateSession",
  oauthUnbind: "oauth.unbind"
});
function compareVersions(a, b) {
  const pa = String(a).replace(/^[vV]/, "").split(".");
  const pb = String(b).replace(/^[vV]/, "").split(".");
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i], 10) || 0;
    const y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x - y;
  }
  const aPre = String(a).replace(/^[vV]/, "").match(/-.*$/)?.[0] ?? "";
  const bPre = String(b).replace(/^[vV]/, "").match(/-.*$/)?.[0] ?? "";
  if (!aPre && !bPre) return 0;
  if (!aPre) return 1;
  if (!bPre) return -1;
  const aParts = aPre.slice(1).split(".");
  const bParts = bPre.slice(1).split(".");
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ax = aParts[i] ?? "";
    const bx = bParts[i] ?? "";
    if (ax === bx) continue;
    const aNum = /^\d+$/.test(ax);
    const bNum = /^\d+$/.test(bx);
    if (aNum && bNum) return Number(ax) - Number(bx);
    if (aNum) return 1;
    if (bNum) return -1;
    return ax < bx ? -1 : 1;
  }
  return 0;
}
function fallbackKind(origin) {
  try {
    const h2 = new URL(origin).hostname.toLowerCase();
    if (h2 === "localhost" || h2 === "::1" || h2 === "0.0.0.0" || /^127\./.test(h2)) return "local";
    if (/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1(?:0\d|1\d|2[0-7]))\.)/.test(h2)) return "lan";
    if (/^(?:fe80:|f[cd][0-9a-f]{2}:)/.test(h2) || h2.endsWith(".local") || !h2.includes(".")) return "lan";
    return "public";
  } catch {
    return "public";
  }
}
var ORIGIN_KINDS = /* @__PURE__ */ new Set(["local", "lan", "public"]);
function buildTroubleshootingContext(status, meta = {}) {
  const s = status ?? {};
  const oauth = s.oauth ?? {};
  const provider = oauth.provider === "github" ? "github" : "gitee";
  const label = provider === "github" ? "GitHub" : "Gitee";
  const appUrl = provider === "github" ? "github.com/settings/developers" : "gitee.com/oauth/applications";
  const scope = provider === "github" ? "read:user" : "user_info";
  const netTargets = provider === "github" ? "github.com \u4E0E api.github.com" : "gitee.com";
  const groups = { local: [], lan: [], public: [] };
  for (const o of s.originQrs ?? []) {
    const kind = ORIGIN_KINDS.has(o?.kind) ? o.kind : fallbackKind(o?.origin ?? "");
    if (o?.origin) groups[kind].push(o.origin);
  }
  const origins = s.oauth?.callbackOrigins ?? [];
  for (const origin of origins) {
    const kind = fallbackKind(origin);
    if (!groups[kind].includes(origin)) groups[kind].push(origin);
  }
  const list = (arr) => arr.length ? arr.map((x) => `- ${x}`).join("\n") : "-\uFF08\u65E0\uFF09";
  const v = meta.version ?? {};
  const installKindText = { source: "source\uFF08\u672C\u5730 git clone / link: \u8F6F\u94FE\uFF0C\u66F4\u65B0\u8D70 git pull\uFF09", git: "git\uFF08github: \u89C4\u683C\u5B89\u88C5\uFF0C\u66F4\u65B0\u8D70\u91CD\u65B0 add\uFF09", unknown: "unknown\uFF08\u672A\u8BC6\u522B\uFF09" }[v.installKind] ?? v.installKind ?? "\u672A\u77E5";
  return `# DSH Pocket \u6392\u969C\u4E0A\u4E0B\u6587
> \u7531 dsh-pocket \u8BBE\u7F6E\u9875\u300C\u590D\u5236\u6392\u969C\u4E0A\u4E0B\u6587\u300D\u6309\u94AE\u751F\u6210\uFF0C\u53EF\u76F4\u63A5\u7C98\u8D34\u7ED9 AI \u6392\u969C\u3002\u654F\u611F\u4FE1\u606F\uFF08Client Secret\uFF09\u4ECE\u4E0D\u56DE\u663E\uFF0C\u4E5F\u4E0D\u5728\u672C\u4E0A\u4E0B\u6587\u4E2D\u3002

## \u6211\u8981\u5B9E\u73B0\u4EC0\u4E48
\u4E0D\u5728\u7535\u8111\u524D\u65F6\uFF0C\u901A\u8FC7\u4EE5\u4E0B\u5730\u5740**\u5B9E\u65F6\u8BBF\u95EE\u7535\u8111\u4E0A\u7684 DeepSeek Harness\uFF08dsh web\uFF09**\u2014\u2014\u624B\u673A/\u4EFB\u610F\u6D4F\u89C8\u5668\u6253\u5F00\u5373\u662F\u7535\u8111\u754C\u9762\uFF0C\u53EF\u53D1\u6D88\u606F\u3001\u770B\u6D41\u5F0F\u8F93\u51FA\u3001\u70B9\u5BA1\u6279\uFF1A
- \u672C\u673A / \u5C40\u57DF\u7F51\uFF1A
${list([...groups.local, ...groups.lan])}
- \u516C\u7F51\uFF08\u81EA\u5EFA\u96A7\u9053 / \u56FA\u5B9A\u57DF\u540D\uFF09\uFF1A
${list(groups.public)}

## \u7CFB\u7EDF\u5982\u4F55\u5DE5\u4F5C\uFF08dsh-pocket \u67B6\u6784\u4E0E\u8BA4\u8BC1\u6A21\u578B\uFF09
- dsh-pocket \u662F dsh web \u7684\u63D2\u4EF6\uFF1A\u5728\u672C\u673A\u8D77\u4E00\u4E2A**\u5355\u7AEF\u53E3\u53CD\u5411\u4EE3\u7406**\uFF08\u9ED8\u8BA4 0.0.0.0:${s.proxyPort ?? 3081}\uFF09\uFF0C\u628A\u5165\u7AD9\u8BF7\u6C42\u7684 Host/Origin \u6539\u5199\u6210 127.0.0.1:${s.dshPort ?? 3080}\uFF08loopback\uFF09\u540E\u8F6C\u53D1\uFF1BHTTP \u4E0E WebSocket \u5168\u900F\u4F20\uFF0C\u6240\u4EE5\u624B\u673A\u770B\u5230\u7684\u5C31\u662F\u7535\u8111\u4E0A\u7684\u754C\u9762\u3002
- \u516C\u7F51\u5165\u53E3\u7531\u7528\u6237**\u81EA\u5EFA\u96A7\u9053**\uFF08\u5FC5\u987B\u6709\u56FA\u5B9A\u57DF\u540D\uFF09\u6307\u5411 \`http://127.0.0.1:${s.proxyPort ?? 3081}\`\uFF1B\u96A7\u9053/\u53CD\u4EE3**\u5FC5\u987B\u4FDD\u6301\u539F\u57DF\u540D Host \u8F6C\u53D1**\uFF08\u82E5\u628A Host \u6539\u5199\u6210 127.0.0.1\uFF0C\u516C\u7F51\u8BF7\u6C42\u4F1A\u88AB\u5224\u4E3A\u672C\u673A\u800C\u514D\u8BA4\u8BC1\uFF09\u3002
- \u8BA4\u8BC1 = **${label} OAuth**\uFF08\u521D\u59CB\u5316\u65F6\u5728 Gitee / GitHub \u4E2D\u4E8C\u9009\u4E00\uFF09\uFF1A\u672C\u673A\u6D4F\u89C8\u5668\u6253\u5F00 \`http://127.0.0.1:${s.proxyPort ?? 3081}/pocket-setup\` \u9009\u5B9A\u9274\u6743\u65B9\u5E76\u7ED1\u5B9A\u4E00\u4E2A\u8D26\u53F7\uFF08uid\uFF09\uFF1B\u6B64\u540E\u4EFB\u610F\u8BBE\u5907\u7ECF\u767D\u540D\u5355\u5730\u5740\u7528**\u540C\u4E00\u4E2A** ${label} \u8D26\u53F7\u767B\u5F55\u6362\u4F1A\u8BDD cookie\uFF08HttpOnly\uFF0C\u7ED1\u5B9A dsh web \u8FDB\u7A0B\u7EA7\u5BC6\u94A5\u2014\u2014**dsh web \u91CD\u542F\u540E\u6240\u6709\u8BBE\u5907\u9700\u91CD\u65B0\u767B\u5F55**\uFF0C\u5C5E\u9884\u671F\uFF09\u3002provider \u4E0E uid \u90FD\u8981\u5BF9\u4E0A\uFF0C\u6362\u5BB6\uFF08Gitee \u21C4 GitHub\uFF09\u9700\u91CD\u65B0\u7ED1\u5B9A\u3002
- ${label} OAuth \u5E94\u7528\uFF08${appUrl}\uFF0C\u6743\u9650 ${scope}\uFF1BGitHub \u514D\u5BA1\u6838\uFF09\u7684\u300C\u56DE\u8C03\u5730\u5740\u300D\u4E0E\u63D2\u4EF6\u767D\u540D\u5355**\u9010\u5B57\u7B26\u4E00\u81F4**\uFF1A\u6BCF\u6761 = \`<\u8BBF\u95EE\u5730\u5740>/pocket-oauth/callback\`\uFF08\u534F\u8BAE\u3001\u57DF\u540D\u3001\u7AEF\u53E3\u90FD\u8981\u4E00\u6837\uFF09\u3002

## \u5F53\u524D\u72B6\u6001\u5FEB\u7167
- \u63D2\u4EF6\u7248\u672C\uFF1A${v.current ? `v${v.current}` : "\u672A\u77E5"}${v.loaded ? `\uFF08\u8FDB\u7A0B\u8FD0\u884C v${v.loaded}\uFF09` : ""}\uFF1B\u5B89\u88C5\u65B9\u5F0F\uFF1A${installKindText}
- \u4EE3\u7406\uFF1A${s.proxyRunning === true ? `\u8FD0\u884C\u4E2D\uFF0C\u7AEF\u53E3 ${s.proxyPort ?? "?"}` : "\u672A\u8FD0\u884C/\u542F\u52A8\u4E2D"}\uFF1B\u4E0A\u6E38 dsh web \u7AEF\u53E3\uFF1A${s.dshPort ?? "?"}
- ${label} OAuth\uFF1A${oauth.configured ? "\u5DF2\u914D\u7F6E" : "\u672A\u914D\u7F6E"}${oauth.bound ? `\uFF0C\u5DF2\u7ED1\u5B9A\u8D26\u53F7 ${oauth.boundLogin ?? "?"}` : "\uFF0C\u672A\u7ED1\u5B9A\u8D26\u53F7"}\uFF1B\u56DE\u8C03\u767D\u540D\u5355 ${oauth.callbackOrigins?.length ?? origins.length ?? 0} \u6761
- \u672C\u673A\u5C40\u57DF\u7F51 IP \u5019\u9009\uFF1A${(s.lanCandidates ?? []).join("\u3001") || "\u65E0"}
- \u6D4F\u89C8\u5668 UA\uFF1A${meta.ua ?? "\u672A\u63D0\u4F9B"}

## \u5E38\u89C1\u5751\uFF08\u6309\u547D\u4E2D\u7387\u6392\u5E8F\uFF09
1. ${label} \u62A5\u300Credirect_uri \u4E0D\u4E00\u81F4/\u6388\u6743\u672A\u5B8C\u6210\u300D\u2192 \u56DE\u8C03\u5730\u5740\u6CA1\u6709\u9010\u5B57\u7B26\u5339\u914D\uFF08http/https\u3001\u57DF\u540D\u3001\u7AEF\u53E3\u3001\u8DEF\u5F84\uFF09\uFF0C${label} \u5E94\u7528\u4E0E\u63D2\u4EF6\u767D\u540D\u5355\u4E24\u5904\u90FD\u8981\u4E00\u81F4\u3002
2. Safari \u6253\u4E0D\u5F00 http:// + \u7EAF IP \u5165\u53E3\uFF08\u53CD\u590D\u8DF3\u8F6C\uFF09\u2192 Safari \u4E0D\u5728\u8BE5\u7C7B\u6E90\u4E0A\u4FDD\u5B58\u63E1\u624B cookie\uFF1B\u6362 Chromium \u7CFB\u6D4F\u89C8\u5668\uFF0C\u6216\u6539\u7528 https \u56FA\u5B9A\u57DF\u540D\u5165\u53E3\u3002
3. \u516C\u7F51\u57DF\u540D\u6253\u5F00\u5F02\u5E38/\u88AB\u62D2 \u2192 \u53CD\u4EE3\u628A Host \u6539\u5199\u6210\u4E86 127.0.0.1\uFF0C\u6216\u8BE5\u57DF\u540D\u4E0D\u5728\u767D\u540D\u5355/${label} \u56DE\u8C03\u4E2D\u3002
4. \u4EE3\u7406\u7AEF\u53E3\u987A\u5EF6\uFF083081 \u88AB\u5360\u81EA\u52A8\u6362 3082\uFF09\u2192 ${label} \u56DE\u8C03\u91CC\u7684\u7AEF\u53E3\u5168\u90E8\u5931\u914D\uFF0C\u9700\u540C\u6B65\u6539\u4E24\u5904\u3002
5. dsh web \u91CD\u542F/\u66F4\u65B0\u540E\u624B\u673A\u88AB\u8E22\u56DE\u767B\u5F55\u9875 \u2192 \u4F1A\u8BDD\u7ED1\u5B9A\u8FDB\u7A0B\u7EA7\u5BC6\u94A5\uFF0C\u5C5E\u9884\u671F\u8BBE\u8BA1\u3002
6. \u9009\u4E86 GitHub \u65F6\u56FD\u5185\u7F51\u7EDC\u4E0D\u7A33 \u2192 \u9700\u80FD\u51FA\u7F51\u8BBF\u95EE ${netTargets}\uFF1B\u56FD\u5185\u7528\u6237\u9009 Gitee \u66F4\u7A33\uFF08\u6362\u5BB6\u5373\u5728 /pocket-setup \u91CD\u9009\u5E76\u91CD\u65B0\u7ED1\u5B9A\uFF09\u3002
`;
}

// lib/clipboard.mjs
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// client/pocket-locales.js
var NS = "pocket";
var zh = {
  "section": "\u624B\u673A\u8BBF\u95EE",
  "title": "\u{1F4F1} \u624B\u673A\u8BBF\u95EE",
  "subtitle": "Gitee / GitHub \u8D26\u53F7\u767B\u5F55\uFF0C\u4EFB\u610F\u8BBE\u5907\u5B9E\u65F6\u540C\u5C4F",
  "developer": "\u5F00\u53D1\u8005\uFF1AJason Li\uFF08cup113\uFF09",
  "derivedFrom": "\u6E90\u81EA \u5C11\u5317\u6668 \u7684 dsh-pocket",
  "starAsk": "\u2B50 \u987A\u624B\u7559\u9897 Star\uFF0C\u4F5C\u8005\u80FD\u9AD8\u5174\u4E00\u6574\u5929",
  "starCta": "\u884C\uFF0C\u7ED9\u4F60\u4E00\u9897 Star",
  "restarted": "\u{1F504} \u5DF2\u91CD\u542F",
  "ok": "\u77E5\u9053\u4E86",
  "bgHint": "\u8FDB\u7A0B\u5728\u540E\u53F0\u8FD0\u884C\uFF08\u4E0D\u6302\u7EC8\u7AEF\uFF09\u3002\u5982\u9700\u505C\u6B62\uFF1A{cmd}",
  "updatedRestart": "\u2705 \u5DF2\u66F4\u65B0 v{ver}\uFF0C\u91CD\u542F\u751F\u6548",
  "updateAutoRestarting": "\u2705 \u5DF2\u66F4\u65B0 v{ver}\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u542F\u2026",
  "updatedOk": "\u2705 \u5DF2\u66F4\u65B0 v{ver}",
  "updateAvailable": "\u{1F4E6} \u65B0\u7248\u672C v{ver}",
  "updating": "\u66F4\u65B0\u4E2D\u2026",
  "updateTo": "\u66F4\u65B0\u5230 v{ver}",
  "restartingNow": "\u6B63\u5728\u91CD\u542F\u751F\u6548\u2026",
  "restarting": "\u91CD\u542F\u4E2D\u2026",
  "restartNow": "\u{1F504} \u91CD\u542F dsh web \u751F\u6548",
  "updatingDetail": "\u23F3 \u66F4\u65B0\u4E2D\uFF08\u901A\u5E38 1-2 \u5206\u949F\uFF09\xB7 \u5DF2\u7B49\u5F85 {s} \u79D2",
  "restartingDetail": "\u23F3 \u6B63\u5728\u91CD\u542F\u751F\u6548\uFF08\u901A\u5E38 10-30 \u79D2\uFF09\xB7 \u5DF2\u7B49\u5F85 {s} \u79D2",
  "updatedAutoDetail": "\u2705 \u5DF2\u66F4\u65B0\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u542F\u751F\u6548\uFF0C\u8BF7\u7A0D\u5019\u5237\u65B0",
  "updatedRestartDetail": "\u2705 \u5DF2\u66F4\u65B0\uFF0C\u91CD\u542F dsh web \u751F\u6548",
  "updateFailed": "\u274C \u5931\u8D25\uFF1A{err}\uFF08\u624B\u52A8\u66F4\u65B0\uFF1A{cmd}\uFF09",
  "versionRange": "\u5F53\u524D v{cur} \u2192 \u6700\u65B0 v{latest}",
  "remoteAccess": "\u8FDC\u7A0B\u8BBF\u95EE\uFF08Gitee / GitHub \u767B\u5F55\uFF09",
  "proxyReady": "\u8FD0\u884C\u4E2D \xB7 \u7AEF\u53E3 {port}",
  "proxyStarting": "\u4EE3\u7406\u542F\u52A8\u4E2D\u2026",
  "setupUrlLabel": "\u521D\u59CB\u5316\u5165\u53E3\uFF08\u5728\u672C\u673A\u6D4F\u89C8\u5668\u6253\u5F00\uFF09",
  "copy": "\u590D\u5236",
  "copied": "\u2705 \u5DF2\u590D\u5236",
  "copyFailed": "\u274C \u590D\u5236\u5931\u8D25\uFF08\u6D4F\u89C8\u5668\u9650\u5236\uFF09",
  "copyContext": "\u{1F4CB} \u590D\u5236\u6392\u969C\u4E0A\u4E0B\u6587",
  "copyContextHint": "\u751F\u6210\u4E00\u6BB5\u5305\u542B\u76EE\u6807\u3001\u67B6\u6784\u4E0E\u5F53\u524D\u72B6\u6001\u7684\u6587\u672C\uFF08\u5DF2\u8131\u654F\uFF09\uFF0C\u53EF\u7C98\u8D34\u7ED9 AI \u5E2E\u4F60\u6392\u67E5",
  "copyContextDone": "\u2705 \u5DF2\u590D\u5236\u6392\u969C\u4E0A\u4E0B\u6587\uFF0C\u53EF\u7C98\u8D34\u7ED9 AI",
  "oauthGuideTitle": "\u521D\u59CB\u5316\u6B65\u9AA4\uFF08\u53EA\u9700\u4E00\u6B21\uFF0C\u9274\u6743\u65B9\u4E8C\u9009\u4E00\uFF09",
  "oauthGuide1Gitee": "\u2460 \u7528 Gitee\uFF08\u56FD\u5185\u66F4\u7A33\uFF09\uFF1A\u5728 gitee.com/oauth/applications \u521B\u5EFA OAuth \u5E94\u7528\uFF0C\u6743\u9650\u52FE\u9009 user_info\u3002\u300C\u5E94\u7528\u56DE\u8C03\u5730\u5740\u300D\u767B\u8BB0\uFF08\u53EF\u591A\u6761\uFF0C\u987B\u9010\u5B57\u7B26\u4E00\u81F4\uFF09\uFF1Ahttp://127.0.0.1:{port}/pocket-oauth/callback\uFF08\u672C\u673A\uFF09\u3001https://\u4F60\u7684\u56FA\u5B9A\u57DF\u540D/pocket-oauth/callback\uFF08\u81EA\u5EFA\u96A7\u9053\uFF09\uFF0C\u53EF\u9009 http://\u5C40\u57DF\u7F51IP:{port}/pocket-oauth/callback\u3002",
  "oauthGuide1Github": "\u2460 \u7528 GitHub\uFF08\u6D77\u5916\u7528\u6237\uFF09\uFF1A\u5728 github.com/settings/developers \u521B\u5EFA OAuth App\uFF08\u514D\u5BA1\u6838\uFF09\uFF0C\u6743\u9650\u9ED8\u8BA4 read:user \u5373\u53EF\uFF1B\u9700\u80FD\u51FA\u7F51\u8BBF\u95EE github.com \u4E0E api.github.com\u3002\u300CAuthorization callback URL\u300D\u767B\u8BB0\uFF08\u6700\u591A 10 \u6761\uFF0C\u987B\u9010\u5B57\u7B26\u4E00\u81F4\uFF09\uFF1Ahttp://127.0.0.1:{port}/pocket-oauth/callback\uFF08\u672C\u673A\uFF09\u3001https://\u4F60\u7684\u56FA\u5B9A\u57DF\u540D/pocket-oauth/callback\uFF08\u81EA\u5EFA\u96A7\u9053\uFF09\uFF0C\u53EF\u9009 http://\u5C40\u57DF\u7F51IP:{port}/pocket-oauth/callback\u3002",
  "oauthGuide2": "\u2461 \u5728\u672C\u673A\u6D4F\u89C8\u5668\u6253\u5F00\u4E0A\u9762\u7684\u521D\u59CB\u5316\u5165\u53E3\uFF0C\u9009\u62E9 Gitee \u6216 GitHub\uFF0C\u586B\u5165 Client ID / Secret \u4E0E\u8BBF\u95EE\u5730\u5740\uFF0C\u70B9\u300C\u4FDD\u5B58\u5E76\u7ED1\u5B9A\u8D26\u53F7\u300D\u3002",
  "oauthGuide3": "\u2462 \u6B64\u540E\u4EFB\u610F\u8BBE\u5907\u7ECF\u767D\u540D\u5355\u5730\u5740\u8BBF\u95EE\uFF0C\u7528\u540C\u4E00\u4E2A\u8D26\u53F7\u767B\u5F55\u5373\u53EF\u2014\u2014\u521B\u5EFA OAuth \u5E94\u7528\u4E0E\u767B\u5F55\u7528\u7684\u662F\u540C\u4E00\u4E2A\u8D26\u53F7\uFF0C\u5168\u7A0B\u53EA\u9700\u8FD9\u4E00\u4E2A\u8D26\u53F7\uFF08\u4EE3\u66FF PIN\uFF09\u3002\u6362\u9274\u6743\u65B9\uFF08Gitee \u21C4 GitHub\uFF09\u9700\u5728\u521D\u59CB\u5316\u9875\u91CD\u9009\u5E76\u91CD\u65B0\u7ED1\u5B9A\u3002",
  "oauthState": "{provider} \u8D26\u53F7",
  "oauthBound": "\u5DF2\u7ED1\u5B9A\uFF1A{login}",
  "oauthUnbound": "\u5DF2\u4FDD\u5B58\u51ED\u636E\uFF0C\u5F85\u7ED1\u5B9A\u8D26\u53F7\u3002",
  "oauthUnboundHint": "\u5728\u672C\u673A\u6253\u5F00\u521D\u59CB\u5316\u5165\u53E3\uFF0C\u70B9\u300C\u4FDD\u5B58\u5E76\u7ED1\u5B9A\u8D26\u53F7\u300D\u5B8C\u6210\u6700\u540E\u4E00\u6B65\u3002",
  "accessOrigins": "\u8BBF\u95EE\u5730\u5740\uFF08\u56DE\u8C03\u767D\u540D\u5355\uFF09\uFF1A",
  "originsGroupLocal": "\u{1F4CD} \u672C\u673A / \u5C40\u57DF\u7F51\uFF08\u540C\u4E00\u7F51\u7EDC\uFF09",
  "originsGroupLocalHint": "\u624B\u673A\u4E0E\u7535\u8111\u8FDE\u540C\u4E00 Wi-Fi \u65F6\u76F4\u63A5\u626B\u7801\u5373\u53EF\uFF0C\u65E0\u9700\u96A7\u9053",
  "originsGroupPublic": "\u{1F310} \u516C\u7F51\uFF08\u81EA\u5EFA\u96A7\u9053 / \u56FA\u5B9A\u57DF\u540D\uFF09",
  "originsGroupPublicHint": "\u9700\u81EA\u5EFA\u96A7\u9053\u628A\u56FA\u5B9A\u57DF\u540D\u6307\u5230 http://127.0.0.1:3081\uFF0C\u4E14\u53CD\u4EE3\u4E0D\u5F97\u628A Host \u6539\u5199\u6210 127.0.0.1",
  "originsGroupPublicEmpty": "\u8FD8\u6CA1\u6709\u516C\u7F51\u5165\u53E3\uFF1A\u628A\u96A7\u9053\u56FA\u5B9A\u57DF\u540D\uFF08https://\u2026\uFF09\u52A0\u8FDB\u767D\u540D\u5355\u5373\u53EF\u4ECE\u5916\u7F51\u8BBF\u95EE",
  "qrHint": "\u626B\u7801\u6253\u5F00\u540E\u70B9\u300C\u4F7F\u7528 {provider} \u8D26\u53F7\u767B\u5F55\u300D",
  "lanCandidatesHint": "\u672C\u673A\u5C40\u57DF\u7F51 IP \u5019\u9009\uFF1A{ips}\uFF08\u53EF\u4F5C\u4E3A\u767D\u540D\u5355\u5730\u5740\uFF09",
  "logoutAll": "\u767B\u51FA\u6240\u6709\u8BBE\u5907",
  "logoutAllTitle": "\u767B\u51FA\u6240\u6709\u8BBE\u5907",
  "logoutAllBody": "\u5C06\u8F6E\u6362\u4F1A\u8BDD\u5BC6\u94A5\uFF1A\u6240\u6709\u5DF2\u767B\u5F55\u8BBE\u5907\u7ACB\u5373\u5931\u6548\uFF0C\u9700\u91CD\u65B0\u767B\u5F55\u3002\u7EE7\u7EED\uFF1F",
  "unbind": "\u89E3\u9664\u7ED1\u5B9A",
  "unbindTitle": "\u89E3\u9664\u8D26\u53F7\u7ED1\u5B9A",
  "unbindBody": "\u4FDD\u7559 Client \u51ED\u636E\u4E0E\u56DE\u8C03\u767D\u540D\u5355\uFF0C\u4EC5\u6E05\u9664\u7ED1\u5B9A\u8D26\u53F7\uFF08\u9274\u6743\u65B9\u4E0D\u53D8\uFF09\uFF1B\u91CD\u65B0\u7ED1\u5B9A\u9700\u5728\u672C\u673A\u6253\u5F00\u521D\u59CB\u5316\u5165\u53E3\u3002\u7EE7\u7EED\uFF1F",
  "rotatedDone": "\u2705 \u5DF2\u767B\u51FA\u6240\u6709\u8BBE\u5907",
  "unbindDone": "\u2705 \u5DF2\u89E3\u9664\u7ED1\u5B9A",
  "securityNote": "\u26A0\uFE0F dsh web \u80FD\u6267\u884C\u4EE3\u7801\uFF1A\u53EA\u7ED1\u5B9A\u81EA\u5DF1\u7684\u8D26\u53F7\uFF08Gitee / GitHub\uFF09\uFF0C\u52FF\u628A\u8BBF\u95EE\u5730\u5740\u4EA4\u7ED9\u4E0D\u4FE1\u4EFB\u7684\u4EBA\u3002",
  "resetFactory": "\u{1F9F9} \u6062\u590D\u51FA\u5382\u8BBE\u7F6E",
  "resetGo": "\u6062\u590D",
  "resetIntro": "\u8BBE\u7F6E\u641E\u51FA\u95EE\u9898\u65F6\u7684\u4E34\u65F6\u515C\u5E95\uFF1A\u6E05\u7A7A\u672C\u673A\u8BBE\u7F6E\u4E0E OAuth \u914D\u7F6E\uFF08Gitee / GitHub \u51ED\u636E\u4E0E\u7ED1\u5B9A\uFF1BDSH \u7684\u4F1A\u8BDD\u3001\u6A21\u578B\u3001\u63D2\u4EF6\u914D\u7F6E\u4E0D\u53D7\u5F71\u54CD\uFF09",
  "resetTitle": "\u26A0\uFE0F \u786E\u8BA4\u6062\u590D\u51FA\u5382\u8BBE\u7F6E\uFF1F",
  "resetBody": "\u5C06\u6E05\u7A7A\u5E76\u6062\u590D\u9ED8\u8BA4\uFF1A\n\u2460 \u8BBE\u7F6E\u6587\u4EF6\uFF08\u542B\u4EE3\u7406\u7AEF\u53E3\uFF09\n\u2461 OAuth\uFF08Gitee / GitHub\uFF09\uFF1AClient \u51ED\u636E\u3001\u56DE\u8C03\u767D\u540D\u5355\u4E0E\u8D26\u53F7\u7ED1\u5B9A\u5168\u90E8\u6E05\u9664\n\u2462 \u4F1A\u8BDD\uFF1A\u6240\u6709\u5DF2\u767B\u5F55\u8BBE\u5907\u7ACB\u5373\u5931\u6548\n\nDSH \u81EA\u8EAB\u7684\u4F1A\u8BDD\u3001\u6A21\u578B\u3001\u63D2\u4EF6\u914D\u7F6E\u4E0D\u53D7\u5F71\u54CD\uFF1B\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002",
  "resetConfirm": "\u786E\u8BA4\u6062\u590D",
  "resetDone": "\u2705 \u5DF2\u6062\u590D\u51FA\u5382\u8BBE\u7F6E\uFF1A\u8BF7\u5728\u672C\u673A\u91CD\u65B0\u5B8C\u6210\u521D\u59CB\u5316",
  "resetFailed": "\u274C \u6062\u590D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",
  "unknownError": "\u672A\u77E5\u9519\u8BEF",
  "cancel": "\u53D6\u6D88",
  "feedback": "\u6709\u95EE\u9898\uFF1F\u6B22\u8FCE\u5230 GitHub Issues \u53CD\u9988 \u{1F64F}"
};
var en = {
  "section": "Phone access",
  "title": "\u{1F4F1} Phone access",
  "subtitle": "Sign in with Gitee or GitHub \u2014 live screen on any device",
  "developer": "Developer: Jason Li (cup113)",
  "derivedFrom": "Based on dsh-pocket by \u5C11\u5317\u6668 (shaobeichen)",
  "starAsk": "\u2B50 Drop a Star if it helped \u2014 it makes the author\u2019s day",
  "starCta": "\u2605 Give a Star",
  "restarted": "\u{1F504} Restarted",
  "ok": "Got it",
  "bgHint": "Running in the background (not attached to a terminal). To stop: {cmd}",
  "updatedRestart": "\u2705 Updated to v{ver} \u2014 restart to apply",
  "updateAutoRestarting": "\u2705 Updated to v{ver} \u2014 auto-restarting\u2026",
  "updatedOk": "\u2705 Updated to v{ver}",
  "updateAvailable": "\u{1F4E6} Update available: v{ver}",
  "updating": "Updating\u2026",
  "updateTo": "Update to v{ver}",
  "restartingNow": "Restarting to apply\u2026",
  "restarting": "Restarting\u2026",
  "restartNow": "\u{1F504} Restart dsh web now",
  "updatingDetail": "\u23F3 Updating (usually 1-2 min) \xB7 {s}s elapsed",
  "restartingDetail": "\u23F3 Restarting to apply (usually 10-30s) \xB7 {s}s elapsed",
  "updatedAutoDetail": "\u2705 Updated \u2014 auto-restarting in progress, refresh shortly",
  "updatedRestartDetail": "\u2705 Updated \u2014 restart dsh web to apply",
  "updateFailed": "\u274C Failed: {err} (manual update: {cmd})",
  "versionRange": "Current v{cur} \u2192 latest v{latest}",
  "remoteAccess": "Remote access (Gitee / GitHub sign-in)",
  "proxyReady": "Running \xB7 port {port}",
  "proxyStarting": "Proxy starting\u2026",
  "setupUrlLabel": "Setup entry (open on this machine)",
  "copy": "Copy",
  "copied": "\u2705 Copied",
  "copyFailed": "\u274C Copy failed (browser restriction)",
  "copyContext": "\u{1F4CB} Copy troubleshooting context",
  "copyContextHint": "Generates a redacted text with your goal, the architecture and the current state \u2014 paste it to an AI for help",
  "copyContextDone": "\u2705 Context copied \u2014 paste it to an AI",
  "oauthGuideTitle": "One-time setup (pick one identity provider)",
  "oauthGuide1Gitee": "\u2460 Use Gitee (more reliable from mainland China): create an OAuth app at gitee.com/oauth/applications and tick the user_info scope. Register its callback URLs (multiple allowed, exact match): http://127.0.0.1:{port}/pocket-oauth/callback (local), https://your-fixed-domain/pocket-oauth/callback (your own tunnel), optionally http://LAN-IP:{port}/pocket-oauth/callback.",
  "oauthGuide1Github": '\u2460 Use GitHub (for users abroad): create an OAuth App at github.com/settings/developers (no review needed) \u2014 the default read:user scope is enough; github.com and api.github.com must be reachable. Register its "Authorization callback URL" (up to 10, exact match): http://127.0.0.1:{port}/pocket-oauth/callback (local), https://your-fixed-domain/pocket-oauth/callback (your own tunnel), optionally http://LAN-IP:{port}/pocket-oauth/callback.',
  "oauthGuide2": '\u2461 Open the setup entry above in a browser on this machine, pick Gitee or GitHub, fill in the Client ID / Secret and access origins, then click "Save & bind account".',
  "oauthGuide3": "\u2462 Afterwards any device signs in via an allowlisted origin with the SAME account \u2014 the account that owns the OAuth app and the account you sign in with are one and the same; a single account is all you need (replaces the PIN). Switching providers (Gitee \u21C4 GitHub) means re-selecting it in the setup page and binding again.",
  "oauthState": "{provider} account",
  "oauthBound": "Bound: {login}",
  "oauthUnbound": "Credentials saved, account not bound yet.",
  "oauthUnboundHint": 'Open the setup entry on this machine and click "Save & bind account" to finish.',
  "accessOrigins": "Access origins (callback allowlist):",
  "originsGroupLocal": "\u{1F4CD} Local & LAN (same network)",
  "originsGroupLocalHint": "Scan directly when the phone is on the same Wi-Fi as this computer \u2014 no tunnel needed",
  "originsGroupPublic": "\u{1F310} Public (self-hosted tunnel / fixed domain)",
  "originsGroupPublicHint": "Requires your own tunnel pointing a fixed domain at http://127.0.0.1:3081; the reverse proxy must keep the original Host header",
  "originsGroupPublicEmpty": "No public entry yet: add the fixed domain of your tunnel (https://\u2026) to the allowlist to reach this machine from outside",
  "qrHint": 'Scan, then tap "Sign in with {provider}"',
  "lanCandidatesHint": "LAN IP candidates on this machine: {ips} (usable as allowlisted origins)",
  "logoutAll": "Sign out everywhere",
  "logoutAllTitle": "Sign out all devices",
  "logoutAllBody": "This rotates the session key: every signed-in device is immediately logged out and must sign in again. Continue?",
  "unbind": "Unbind account",
  "unbindTitle": "Unbind the account",
  "unbindBody": "Keeps the client credentials, callback allowlist and identity provider, only clears the bound account; re-binding requires the setup entry on this machine. Continue?",
  "rotatedDone": "\u2705 Signed out all devices",
  "unbindDone": "\u2705 Account unbound",
  "securityNote": "\u26A0\uFE0F dsh web can execute code: bind only your own account (Gitee / GitHub) and never share the access URL with untrusted people.",
  "resetFactory": "\u{1F9F9} Factory reset",
  "resetGo": "Reset",
  "resetIntro": "Temporary fallback when settings break: clear local settings and the OAuth config (Gitee / GitHub credentials and binding; DSH sessions, models and plugin config are untouched)",
  "resetTitle": "\u26A0\uFE0F Confirm factory reset?",
  "resetBody": "This clears and restores defaults:\n\u2460 Settings file (proxy port)\n\u2461 OAuth (Gitee / GitHub): client credentials, callback allowlist and account binding are all cleared\n\u2462 Sessions: every signed-in device is immediately logged out\n\nYour DSH sessions, models and plugin config are untouched. This cannot be undone.",
  "resetConfirm": "Reset",
  "resetDone": "\u2705 Factory reset done \u2014 run setup again on this machine",
  "resetFailed": "\u274C Reset failed \u2014 please retry",
  "unknownError": "unknown error",
  "cancel": "Cancel",
  "feedback": "\u{1F64F} Questions? Open an issue on GitHub"
};

// client/index.jsx
var name = "dsh-pocket";
var inject = ["slots", "connection", "layout", "locale", "sessionLogDownload"];
function fmt(t, key, vars) {
  let s = t(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = String(s).split(`{${k}}`).join(String(v));
    }
  }
  return s;
}
function manualUpdateCmd(kind) {
  if (kind === "source") return "git pull \u540E\u91CD\u542F dsh web";
  return "dsh plugin --profile web add github:cup113/dsh-pocket-oauth -w";
}
function providerLabel(provider) {
  return provider === "github" ? "GitHub" : "Gitee";
}
var styles = {
  card: { background: "var(--dsw-alias-bg-layer-1,#fff)", border: "1px solid var(--dsw-alias-border-l2,#e5e7eb)", borderRadius: 12, padding: "16px 20px", maxWidth: 480 },
  block: { borderTop: "1px solid var(--dsw-alias-border-l2,#e5e7eb)", marginTop: 16, paddingTop: 16 },
  muted: { color: "var(--dsw-alias-label-tertiary,#8b93a1)", fontSize: 12, lineHeight: 1.5 },
  code: { fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, wordBreak: "break-all", margin: "6px 0 10px", color: "var(--dsw-alias-label-primary,inherit)" },
  // 主按钮：官方 md 胶囊形（36px）
  primary: { font: "inherit", cursor: "pointer", border: "none", background: "var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary,#4f6ef7))", color: "var(--dsw-alias-label-primary-foreground, #fff)", height: 36, padding: "0 16px", borderRadius: 999, fontSize: 13, fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  // 次级按钮：官方 outline/ghost 胶囊形
  btn: { font: "inherit", cursor: "pointer", border: "1px solid var(--dsw-alias-button-ghost-active-border, var(--dsw-alias-border-l2,#d1d5db))", background: "var(--dsw-alias-bg-layer-1,#fff)", color: "var(--dsw-alias-label-primary,inherit)", height: 36, padding: "0 16px", borderRadius: 999, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  qr: { width: 220, height: 220, borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2,#e5e7eb)", margin: "8px 0" },
  warn: { color: "var(--dsw-alias-state-warn-primary,#b45309)", fontSize: 12, lineHeight: 1.5 }
};
function PocketSettingsTab({ rpcCall, t }) {
  const [status, setStatus] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [restartNotice, setRestartNotice] = (0, import_react.useState)(false);
  const [updateInfo, setUpdateInfo] = (0, import_react.useState)(null);
  const [isDesktop, setIsDesktop] = (0, import_react.useState)(false);
  const [installKind, setInstallKind] = (0, import_react.useState)(null);
  const [now, setNow] = (0, import_react.useState)(Date.now());
  (0, import_react.useEffect)(() => {
    const t2 = setInterval(() => setNow(Date.now()), 1e3);
    return () => clearInterval(t2);
  }, []);
  const elapsed = (startedAt) => startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1e3)) : 0;
  const call = async (endpoint, payload) => {
    const res = await rpcCall(endpoint, payload);
    if (!res?.ok) throw new Error(res?.error?.message ?? "RPC failed");
    return res.value;
  };
  const load = async () => {
    try {
      const s = await call(POCKET_ENDPOINTS.status, {});
      setStatus(s);
      if (s.desktop) setIsDesktop(true);
      if (s.restartNotice) {
        setRestartNotice(true);
        setUpdateInfo(null);
        if (!sessionStorage.getItem("dshp-auto-reloaded")) {
          sessionStorage.setItem("dshp-auto-reloaded", "1");
          setTimeout(() => {
            try {
              location.reload();
            } catch {
            }
          }, 2e3);
        }
      }
    } catch {
    }
  };
  (0, import_react.useEffect)(() => {
    load();
    const t2 = setInterval(load, 3e3);
    return () => clearInterval(t2);
  }, []);
  (0, import_react.useEffect)(() => {
    try {
      sessionStorage.removeItem("dshp-auto-reloaded");
    } catch {
    }
  }, []);
  (0, import_react.useEffect)(() => {
    if (isDesktop) return;
    let alive = true;
    const check = async () => {
      try {
        const v = await call(POCKET_ENDPOINTS.version, {});
        if (!alive) return;
        if (v.installKind) setInstallKind(v.installKind);
        const meta = await (await fetch("https://raw.githubusercontent.com/cup113/dsh-pocket-oauth/main/package.json", { cache: "no-store" })).json();
        if (!alive) return;
        const latest = typeof meta?.version === "string" ? meta.version : null;
        if (latest && v.current && compareVersions(latest, v.current) > 0) {
          setUpdateInfo({ current: v.current, latest, updating: false, result: null, installKind: v.installKind ?? null });
        } else if (v.current && v.loaded && compareVersions(v.current, v.loaded) > 0) {
          setUpdateInfo({ current: v.current, latest: v.current, updating: false, result: "ok", updated: true, installKind: v.installKind ?? null });
        }
      } catch {
      }
    };
    check();
    const t2 = setInterval(check, 5 * 60 * 1e3);
    return () => {
      alive = false;
      clearInterval(t2);
    };
  }, [isDesktop]);
  const restartPocket = async () => {
    setUpdateInfo((u) => ({ ...u, restarting: true, startedAt: Date.now() }));
    try {
      await Promise.race([
        call(POCKET_ENDPOINTS.restart, {}),
        new Promise((_, rej) => setTimeout(() => rej(new Error("restart requested (no reply within 3s)")), 3e3))
      ]);
      setUpdateInfo((u) => ({ ...u, restarting: true, result: "ok" }));
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (/connection|socket|fetch|network|abort|cancelled|ECONN|disconnect|closed|timeout/i.test(msg)) {
        setUpdateInfo((u) => ({ ...u, restarting: true, result: "ok" }));
        return;
      }
      setUpdateInfo((u) => ({ ...u, restarting: false, result: "fail", output: err.message }));
    }
  };
  const runUpdate = async () => {
    setUpdateInfo((u) => ({ ...u, updating: true, result: null, startedAt: Date.now(), installKind: u?.installKind ?? installKind }));
    try {
      const r = await call(POCKET_ENDPOINTS.update, {});
      setUpdateInfo((u) => ({
        ...u,
        updating: false,
        result: r.ok ? "ok" : "fail",
        autoRestart: r.autoRestart === true,
        output: r.output ?? r.error
      }));
    } catch (err) {
      setUpdateInfo((u) => ({ ...u, updating: false, result: "fail", output: err.message }));
    }
  };
  const rotateSession = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(POCKET_ENDPOINTS.oauthRotateSession, {});
      showToast(t("rotatedDone"));
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
      showToast(t("unbindDone"));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const errText = (msg) => {
    const s = String(msg ?? "");
    const i = s.indexOf(" | ");
    if (i < 0) return s;
    return (t("ok") === zh.ok ? s.slice(0, i) : s.slice(i + 3)).trim();
  };
  const [toast, setToast] = (0, import_react.useState)(null);
  const toastTimer = (0, import_react.useRef)(null);
  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  (0, import_react.useEffect)(() => () => clearTimeout(toastTimer.current), []);
  const [confirmState, setConfirmState] = (0, import_react.useState)(null);
  const openConfirm = (title, body, confirmLabel, danger, action) => setConfirmState({ title, body, confirmLabel, danger, action });
  const runConfirmed = async () => {
    const st = confirmState;
    setConfirmState(null);
    if (st?.action) await st.action();
  };
  const doFactoryReset = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await call(POCKET_ENDPOINTS.pocketReset, { confirm: true });
      setStatus(next);
      showToast(t("resetDone"));
    } catch (err) {
      setError(err.message);
      showToast(t("resetFailed"));
    } finally {
      setBusy(false);
    }
  };
  const qrArea = (src, url, hint) => (0, import_react.createElement)(
    "div",
    { style: { background: "var(--dsw-alias-bg-layer-2,#f3f4f6)", borderRadius: 10, padding: "10px 12px", textAlign: "center", margin: "10px 0" } },
    (0, import_react.createElement)("img", { src, alt: "QR", style: styles.qr }),
    (0, import_react.createElement)("div", { style: styles.code }, url),
    (0, import_react.createElement)("div", { style: styles.muted }, hint)
  );
  const row = (label, control, extra) => (0, import_react.createElement)(
    "div",
    { style: { borderTop: "1px solid var(--dsw-alias-border-l2,#e5e7eb)", paddingTop: 9, marginTop: 9 } },
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
      (0, import_react.createElement)("span", { style: { fontSize: 13 } }, label),
      control
    ),
    extra ?? null
  );
  const originGroups = () => {
    const groups = { local: [], lan: [], public: [] };
    for (const o of status?.originQrs ?? []) {
      (groups[o.kind ?? fallbackKind(o.origin)] ?? groups.public).push(o);
    }
    const card = (o) => (0, import_react.createElement)(
      "div",
      { key: o.origin },
      o.qr ? qrArea(o.qr, o.origin, fmt(t, "qrHint", { provider: pLabel })) : (0, import_react.createElement)("div", { style: styles.code }, o.origin)
    );
    const near = [...groups.local, ...groups.lan];
    return (0, import_react.createElement)(
      "div",
      null,
      near.length > 0 ? (0, import_react.createElement)(
        "div",
        { style: { marginTop: 6 } },
        (0, import_react.createElement)("div", { style: { fontWeight: 600, fontSize: 12 } }, t("originsGroupLocal")),
        (0, import_react.createElement)("div", { style: styles.muted }, t("originsGroupLocalHint")),
        near.map(card),
        lanCandidates.length > 0 ? (0, import_react.createElement)("div", { style: { ...styles.muted, marginTop: 6 } }, fmt(t, "lanCandidatesHint", { ips: lanCandidates.join("\u3001") })) : null
      ) : null,
      (0, import_react.createElement)(
        "div",
        { style: { marginTop: near.length > 0 ? 10 : 6 } },
        (0, import_react.createElement)("div", { style: { fontWeight: 600, fontSize: 12 } }, t("originsGroupPublic")),
        groups.public.length > 0 ? (0, import_react.createElement)(
          "div",
          null,
          (0, import_react.createElement)("div", { style: styles.muted }, t("originsGroupPublicHint")),
          groups.public.map(card)
        ) : (0, import_react.createElement)("div", { style: styles.muted }, t("originsGroupPublicEmpty"))
      )
    );
  };
  const proxyPort = status?.proxyPort ?? null;
  const setupUrl = proxyPort ? `http://127.0.0.1:${proxyPort}/pocket-setup` : "http://127.0.0.1:3081/pocket-setup";
  const oauth = status?.oauth ?? { provider: "gitee", configured: false, callbackOrigins: [], bound: false, boundLogin: null };
  const pLabel = providerLabel(oauth.provider);
  const lanCandidates = status?.lanCandidates ?? [];
  const copyWithToast = async (text, doneKey = "copied") => {
    const ok = await copyText(text);
    showToast(ok ? t(doneKey) : t("copyFailed"));
    return ok;
  };
  const copyTroubleshoot = async () => {
    try {
      const [s, v] = await Promise.all([
        call(POCKET_ENDPOINTS.status, {}),
        call(POCKET_ENDPOINTS.version, {}).catch(() => ({}))
      ]);
      const md = buildTroubleshootingContext(s, {
        version: v ?? {},
        ua: typeof navigator !== "undefined" ? navigator.userAgent : ""
      });
      await copyWithToast(md, "copyContextDone");
    } catch (err) {
      setError(err.message);
    }
  };
  return (0, import_react.createElement)(
    "div",
    { style: styles.card },
    (0, import_react.createElement)(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
      (0, import_react.createElement)(
        "div",
        null,
        (0, import_react.createElement)("strong", null, t("title")),
        (0, import_react.createElement)("div", { style: styles.muted }, t("subtitle"))
      ),
      (0, import_react.createElement)(
        "div",
        { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary,#8b93a1)", textAlign: "right" } },
        (0, import_react.createElement)("div", { style: { whiteSpace: "nowrap" } }, t("developer")),
        (0, import_react.createElement)("div", { style: { whiteSpace: "nowrap" } }, t("derivedFrom")),
        (0, import_react.createElement)("div", { style: { whiteSpace: "nowrap", marginTop: 2 } }, t("starAsk")),
        (0, import_react.createElement)(
          "a",
          { href: "https://github.com/cup113/dsh-pocket-oauth", target: "_blank", rel: "noreferrer", style: { color: "var(--dsw-alias-brand-primary,#4f6ef7)", fontSize: 12, lineHeight: 1.6, textDecoration: "underline" } },
          t("starCta")
        ),
        (0, import_react.createElement)("button", {
          type: "button",
          title: t("copyContextHint"),
          style: { ...styles.btn, height: 26, padding: "0 10px", fontSize: 12, marginTop: 6 },
          onClick: copyTroubleshoot
        }, t("copyContext"))
      )
    ),
    // 桌面端不显示更新/重启横幅（更新由 DSH Desktop 管理），也不需要额外提示
    // 重启后提示（进程在后台运行，停止方法）——左侧蓝色色条（桌面端不会触发本插件的自重启）
    !isDesktop && restartNotice ? (0, import_react.createElement)(
      "div",
      { style: { ...styles.block, borderLeft: "4px solid var(--dsw-alias-brand-primary,#4f6ef7)", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2,#f3f4f6)", padding: "10px 12px" } },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
        (0, import_react.createElement)("div", { style: { fontWeight: 600, fontSize: 13 } }, t("restarted")),
        (0, import_react.createElement)("button", { style: styles.btn, onClick: () => setRestartNotice(false) }, t("ok"))
      ),
      (0, import_react.createElement)("div", { style: styles.muted, marginTop: 4, wordBreak: "break-all" }, fmt(t, "bgHint", { cmd: status?.killHint ?? `lsof -ti :${status?.dshPort ?? 3080} | xargs kill -9` }))
    ) : null,
    // 更新提示——左侧黄色色条（提示有新版本）；单状态：有更新/更新中/已更新自动重启，不并存
    // 桌面端不渲染（更新由 DSH Desktop 管理）
    !isDesktop && updateInfo ? (0, import_react.createElement)(
      "div",
      { style: { ...styles.block, borderLeft: "4px solid var(--dsw-alias-state-warn-primary,#b45309)", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2,#f3f4f6)", padding: "10px 12px" } },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
        (0, import_react.createElement)(
          "div",
          { style: { fontWeight: 600, fontSize: 13 } },
          updateInfo.updated ? fmt(t, "updatedRestart", { ver: updateInfo.current }) : updateInfo.result === "ok" ? updateInfo.autoRestart ? fmt(t, "updateAutoRestarting", { ver: updateInfo.latest }) : fmt(t, "updatedOk", { ver: updateInfo.latest }) : fmt(t, "updateAvailable", { ver: updateInfo.latest })
        ),
        updateInfo.result !== "ok" ? (0, import_react.createElement)("button", { style: styles.primary, onClick: runUpdate, disabled: updateInfo.updating }, updateInfo.updating ? t("updating") : fmt(t, "updateTo", { ver: updateInfo.latest })) : updateInfo.autoRestart ? (0, import_react.createElement)("button", { style: styles.btn, disabled: true }, t("restartingNow")) : (0, import_react.createElement)("button", { style: styles.primary, onClick: restartPocket, disabled: updateInfo.restarting }, updateInfo.restarting ? t("restarting") : t("restartNow"))
      ),
      (0, import_react.createElement)(
        "div",
        { style: styles.muted, marginTop: 4 },
        updateInfo.updating ? fmt(t, "updatingDetail", { s: elapsed(updateInfo.startedAt) }) : updateInfo.restarting ? fmt(t, "restartingDetail", { s: elapsed(updateInfo.startedAt) }) : updateInfo.result === "ok" ? updateInfo.autoRestart ? t("updatedAutoDetail") : t("updatedRestartDetail") : updateInfo.result === "fail" ? fmt(t, "updateFailed", { err: errText(updateInfo.output) || t("unknownError"), cmd: manualUpdateCmd(updateInfo.installKind ?? installKind) }) : fmt(t, "versionRange", { cur: updateInfo.current, latest: updateInfo.latest })
      )
    ) : null,
    // 远程访问（Gitee OAuth）：代理状态 + 初始化引导 + 绑定状态 + 地址二维码
    (0, import_react.createElement)(
      "div",
      { style: styles.block },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
        (0, import_react.createElement)("span", { style: { fontWeight: 600, fontSize: 13 } }, t("remoteAccess")),
        status?.proxyRunning ? (0, import_react.createElement)("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary,#8b93a1)" } }, fmt(t, "proxyReady", { port: proxyPort ?? "\u2014" })) : (0, import_react.createElement)("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-warn-primary,#b45309)" } }, t("proxyStarting"))
      ),
      // 初始化入口（本机）：随时可见（未配置时的核心引导；已配置时也可用来改配置/换绑）
      row(
        t("setupUrlLabel"),
        (0, import_react.createElement)("button", { style: { ...styles.btn, height: 26, padding: "0 10px", fontSize: 12 }, onClick: () => copyWithToast(setupUrl) }, t("copy")),
        (0, import_react.createElement)("div", { style: styles.code }, setupUrl)
      ),
      // 状态分支
      !oauth.configured ? (0, import_react.createElement)(
        "div",
        { style: { marginTop: 8, fontSize: 12, lineHeight: 1.8, color: "var(--dsw-alias-label-secondary,#6b7280)", background: "var(--dsw-alias-bg-layer-2,#f3f4f6)", borderRadius: 10, padding: "10px 12px" } },
        (0, import_react.createElement)("div", { style: { fontWeight: 600, marginBottom: 4, color: "var(--dsw-alias-label-primary,inherit)" } }, t("oauthGuideTitle")),
        fmt(t, "oauthGuide1Gitee", { port: proxyPort ?? 3081 }),
        (0, import_react.createElement)("div", { style: { marginTop: 6 } }, fmt(t, "oauthGuide1Github", { port: proxyPort ?? 3081 })),
        (0, import_react.createElement)("div", { style: { marginTop: 6 } }, t("oauthGuide2")),
        (0, import_react.createElement)("div", null, t("oauthGuide3")),
        (0, import_react.createElement)("div", { style: { ...styles.warn, marginTop: 6 } }, t("securityNote"))
      ) : !oauth.bound ? (0, import_react.createElement)(
        "div",
        { style: { marginTop: 8, fontSize: 12, lineHeight: 1.7, color: "var(--dsw-alias-state-warn-primary,#b45309)" } },
        t("oauthUnbound"),
        (0, import_react.createElement)("br"),
        null,
        " ",
        t("oauthUnboundHint")
      ) : (0, import_react.createElement)(
        "div",
        { style: { marginTop: 8 } },
        row(fmt(t, "oauthState", { provider: pLabel }), (0, import_react.createElement)("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary,inherit)" } }, fmt(t, "oauthBound", { login: oauth.boundLogin ?? "\u2014" }))),
        oauth.callbackOrigins.length > 0 ? originGroups() : null,
        (0, import_react.createElement)(
          "div",
          { style: { marginTop: 10 } },
          (0, import_react.createElement)("button", { style: { ...styles.btn, height: 28, padding: "0 12px", fontSize: 12 }, disabled: busy, onClick: () => openConfirm(t("logoutAllTitle"), t("logoutAllBody"), t("logoutAll"), false, rotateSession) }, t("logoutAll")),
          (0, import_react.createElement)("button", { style: { ...styles.btn, height: 28, padding: "0 12px", fontSize: 12, marginLeft: 8, color: "var(--dsw-alias-state-error-primary,#dc2626)" }, disabled: busy, onClick: () => openConfirm(t("unbindTitle"), t("unbindBody"), t("unbind"), true, unbindOauth) }, t("unbind"))
        ),
        (0, import_react.createElement)("div", { style: { ...styles.warn, marginTop: 8 } }, t("securityNote"))
      )
    ),
    error ? (0, import_react.createElement)("div", { style: { color: "var(--dsw-alias-state-error-primary,#dc2626)", fontSize: 12, marginTop: 8 } }, `\u274C ${errText(error)}`) : null,
    // 恢复出厂设置：设置出问题时的临时兜底（最底部，避免误触）
    (0, import_react.createElement)(
      "div",
      { style: styles.block },
      (0, import_react.createElement)(
        "div",
        { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
        (0, import_react.createElement)("span", { style: { fontWeight: 600, fontSize: 13 } }, t("resetFactory")),
        (0, import_react.createElement)("button", { style: { ...styles.btn, height: 28, padding: "0 12px", fontSize: 12, color: "var(--dsw-alias-state-error-primary,#dc2626)" }, onClick: () => openConfirm(t("resetTitle"), t("resetBody"), t("resetConfirm"), true, doFactoryReset) }, t("resetGo"))
      ),
      (0, import_react.createElement)("div", { style: { ...styles.muted, marginTop: 6 } }, t("resetIntro"))
    ),
    // 通用确认弹框（恢复出厂 / 登出所有设备 / 解除绑定）
    confirmState ? (0, import_react.createElement)(
      "div",
      { style: { position: "fixed", inset: 0, zIndex: 1e4, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 } },
      (0, import_react.createElement)(
        "div",
        { style: { background: "var(--dsw-alias-bg-layer-1,#fff)", borderRadius: 12, maxWidth: 420, width: "100%", padding: "20px 22px", boxShadow: "0 8px 32px rgba(0,0,0,.18)" } },
        (0, import_react.createElement)("div", { style: { fontWeight: 600, fontSize: 15, color: confirmState.danger ? "var(--dsw-alias-state-warn-primary,#b45309)" : "var(--dsw-alias-brand-primary,#4f6ef7)", marginBottom: 10 } }, confirmState.title),
        // whiteSpace: pre-line —— 恢复出厂的说明文案带换行（①②③ 分条），要原样保留
        (0, import_react.createElement)("div", { style: { fontSize: 13, lineHeight: 1.7, color: "var(--dsw-alias-label-primary,inherit)", whiteSpace: "pre-line" } }, confirmState.body),
        (0, import_react.createElement)(
          "div",
          { style: { display: "flex", gap: 8, marginTop: 16 } },
          (0, import_react.createElement)("button", { style: { ...styles.btn, flex: 1 }, onClick: () => setConfirmState(null) }, t("cancel")),
          (0, import_react.createElement)("button", { style: { ...styles.primary, flex: 1, ...confirmState.danger ? { background: "var(--dsh-alias-state-error-primary,#dc2626)" } : {} }, onClick: runConfirmed }, confirmState.confirmLabel)
        )
      )
    ) : null,
    // Toast：操作反馈（固定屏幕正中央，2.6s 自动消失）
    toast ? (0, import_react.createElement)("div", {
      style: { position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 10001, width: "auto", maxWidth: 280, background: "rgba(17,24,39,.92)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, lineHeight: 1.5, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,.22)" }
    }, toast) : null,
    // 页面最底部：反馈入口
    (0, import_react.createElement)(
      "div",
      { style: { ...styles.block, textAlign: "center" } },
      (0, import_react.createElement)(
        "a",
        { href: "https://github.com/cup113/dsh-pocket-oauth/issues", target: "_blank", rel: "noreferrer", style: { fontSize: 12, color: "var(--dsw-alias-label-secondary,#6b7280)", textDecoration: "none" } },
        t("feedback")
      )
    )
  );
}
function applyRemote(ctx) {
  if (ctx?.connection) {
    try {
      Object.defineProperty(ctx.connection, "isLoopback", { value: true, writable: true, configurable: true });
    } catch {
      try {
        ctx.connection.isLoopback = true;
      } catch {
      }
    }
  }
  const rpcCall = (endpoint, payload, signal) => ctx.connection.rpc.call(POCKET_RPC_CHANNEL, endpoint, payload, signal);
  const translate = ctx.locale.bind(NS);
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-pocket: pocket locale dictionaries");
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "pocket",
        order: 1,
        label: () => translate("section"),
        inject: () => ({ rpcCall, t: translate })
      },
      PocketSettingsTab
    )
  );
}
function apply(ctx) {
  applyRemote(ctx);
}

    return module.exports;
  }
});
