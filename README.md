<p align="center">
  <img src="docs/banner.jpg" alt="DSH Pocket" width="100%">
</p>

<h1 align="center">DSH Pocket</h1>

<p align="center"><a href="README.en.md">English</a> | <a href="README.md">中文</a></p>

<p align="center">
  <a href="https://github.com/cup113/dsh-pocket-oauth/actions"><img alt="CI" src="https://github.com/cup113/dsh-pocket-oauth/actions/workflows/test.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: GPL-2.0" src="https://img.shields.io/badge/license-GPL--2.0-blue.svg"></a>
  <a href="https://github.com/cup113/dsh-pocket-oauth/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/cup113/dsh-pocket-oauth"></a>
  <a href="https://awesome-dsh-plugin.com/zh/"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
</p>

> 把 **DeepSeek Harness 装进你的口袋**：插件只开一个端口（3081），用 **Gitee / GitHub OAuth 登录**（初始化时二选一）代替访问密码，**隧道由你自己建**——手机随时实时看到电脑上的同一个界面。

<p align="center">
  ⭐ 顺手留颗 Star，作者能高兴一整天 &nbsp;·&nbsp; <a href="https://github.com/cup113/dsh-pocket-oauth">行，给你一颗 Star</a>
</p>

## 这是什么

**你不在电脑前，也想用电脑上的 DeepSeek Harness。**

- 下班路上，agent 在电脑上跑任务，你想掏出手机看看它干到哪了、结果如何
- 出门在外，突然想让电脑上的 agent 查点资料、写段代码，但没有远程桌面、没有 SSH
- 电脑在宿舍/办公室，你人在外面，想随时"操控你的 DeepSeek Harness"——发任务、看输出、点审批

DSH Pocket 就是干这个的：**只暴露一个端口，登录一次 Gitee / GitHub 账号，手机就能实时看到并操控电脑上的 DeepSeek Harness 界面**。

实际效果——手机上的界面就是电脑上的界面，实时同步：

<p align="center">
  <img src="docs/interface.jpg" alt="手机上的 DSH 界面" width="100%">
</p>

## ✨ 特性

| 特性                | 说明                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🚪 单端口           | 只暴露 **3081**（代理），把入站 Host/Origin 改写成 loopback 后转发给本机 dsh web——**不需要改 dsh 的任何配置**，也不碰 dsh 官方禁用的 0.0.0.0 绑定             |
| 🔐 Gitee / GitHub 登录 | **彻底取代访问密码**：初始化时**二选一**（国内选 Gitee，海外选 GitHub），绑定该账号（鉴权方 + uid）；此后任何设备经白名单地址打开，用**同一个账号**登录即进入。换家＝在初始化页重选并重新绑定                    |
| 🔗 多回调白名单     | Gitee / GitHub 应用的「回调地址」都可登记多条（GitHub 上限 10 条）：本机 `http://127.0.0.1:3081/...`、隧道固定域名 `https://你的域名/...`、可选局域网 IP——**当前访问地址在哪条白名单里，就用哪条回调** |
| 🏠 本机免登录       | `127.0.0.1` / `localhost` 直连免认证（能在本机直连本来就已经上了这台机器），初始化页面也只在**本机**可打开                                                       |
| 🧱 未初始化即全拒   | 没配置凭据/没绑定账号时，所有非本机访问一律拒绝（**fail closed**），不会出现"装完就裸奔"                                                                        |
| 🌐 隧道自建         | 插件**不管理任何隧道**：你用 frp / Tailscale Funnel / 自建 nginx 反代 / 各类内网穿透，把**固定域名**指到 `http://127.0.0.1:3081` 即可（需要固定域名，原因见下）     |
| 📱 地址二维码       | 设置页为每条白名单地址生成二维码，并按**本机 / 局域网**与**公网（自建隧道）**分成两区展示，各配使用前提说明                                                                                        |
| 🧘 会话保持         | 登录后种 HttpOnly 会话 cookie（30 天），**长期免输**；登录状态绑定电脑上的 dsh web 进程——**重启/更新后需重新登录一次**                                          |
| 🚪 一键登出         | 「登出所有设备」= 轮换进程级会话密钥，所有已登录设备立即失效（换手机、怀疑泄露时用）                                                                             |
| 🧾 排障上下文       | 设置页「复制排障上下文」一键生成含使用目标、架构与认证模型、当前状态快照的文本（已脱敏），粘贴给任意 AI 即可让它接手排查                                          |
| ⚡ 实时同步         | 流式输出走 WebSocket 全透传——**电脑上在输出，手机上同步在滚**，可双向操作；内置心跳保活（防 NAT/省电机制静默断链，断线自动重连）                                 |
| 🗜️ 传输压缩         | 大 JSON 响应自动 gzip/brotli（长会话 17MB → ~1MB，brotli 质量 6：快且省流量），手机加载更快、更省流量                                                            |
| 🧩 零额外服务       | 一个 npm 包（远程操控 + 手机端 WebUI 组件）；不需要自建服务器或中继（登录用你自己的 Gitee / GitHub 账号）                                                        |
| 📱 手机端界面       | 手机打开就是电脑上的官方界面（同一个 `dsh web`、实时同屏），并自动套用窄屏优化：抽屉式侧边栏、设置两级导航、触屏输入框、Plan 审阅卡片                                        |

### 🧩 两个可独立开关的组件

一个包里装了两个组件，安装/更新仍然只有一条命令；组件在 **侧边栏 → 插件 → dsh-pocket** 卡片里各自有一个开关：

| 组件                                | 负责                                                | 关掉之后                                                                 |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `dsh-pocket`（远程操控）            | 单端口代理、Gitee/GitHub OAuth、地址二维码、更新/重启 | 代理不再监听（3081 关闭）、无「手机访问」设置区；手机照样能打开官方界面（局域网/隧道直连本机 dsh web） |
| `dsh-pocket-mobile`（手机端 WebUI） | 窄屏（< 1024px）自动生效：抽屉式左侧栏、全局面板返回键、两级设置导航、触屏输入框、Plan / 审批卡片 | 手机打开就是官方桌面排版（侧栏被挤成 56px 图标条、设置页左右并排挤压） |

> **手机端 WebUI 现在带客户端产物**：子包 `dsh-pocket-mobile`（源码在 `mobile/`，随包一起安装）声明了 `dsh.client`，客户端半边由 `client/build.mjs` 打包成 `mobile/client/client.js`，面板里那条 row 因此有「配置」页，可以关掉遮罩、输入框优化与设置分步导航。
>
> 开关写在 profile 的 `cordis.patch.yml`（DSH 原生机制）：**宿主半边即时停/启**；客户端产物的进出在下一次页面加载时生效，切完开关刷新一下页面即可。

设置里只有远程操控的「手机访问」（代理 / OAuth / 二维码 / 更新 / 重启），**没有**手机端界面相关的独立页；移动端微调在「插件 → dsh-pocket 卡片」里。

## 🚀 怎么用

**入口在哪**：安装完成并重启 `dsh web` 后，打开 **设置**，左侧边栏就能看到 **「手机访问」** 入口（和「通用设置」「模型」同级）：

<p align="center">
  <img src="docs/entry.jpg" alt="手机访问入口" width="70%">
</p>

**前提**：电脑上已装好 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。如果终端提示 `dsh: command not found`（找不到 dsh 命令），先安装：

```sh
npm install -g @deepseek-ai/dsh     # 全局安装；验证：dsh --version
# 不想全局装？每次命令前加 npx：npx @deepseek-ai/dsh <命令>
```

```sh
# 1. 安装本仓库（从 GitHub 拉取；包名是 dsh-pocket，仓库名是 dsh-pocket-oauth）
dsh plugin --profile web add github:cup113/dsh-pocket-oauth -w
#    ↑ 首次会以 ERR_PNPM_IGNORED_BUILDS 失败一次：手机端子包靠根包 postinstall 建链接，
#      而 pnpm 11 默认拦下依赖脚本。在插件面板点「允许这些脚本并重试」后，重跑这条命令即可（只需一次）。

# 2. 重启 dsh web
npx @deepseek-ai/dsh web
```

> ℹ️ npm 上的 `dsh-pocket` 是**原版**（PIN 模型，不是本仓库）——**不要**用 `dsh plugin add dsh-pocket`，那装到的是原版。本仓库只从 GitHub 安装。
> ⚠️ **已经装过旧版的用户**：`github:` 规格会把版本 pin 在当时的 main 提交上，光重启不会升级。要拿到修好的手机端子包，必须重新执行一次上面的 `add` 命令（并按提示允许一次构建脚本）。
> 🔄 设置页的「一键更新」会先探测安装方式再选择正确动作：`github:` 规格安装重跑一次 add（重新 pin 最新 main 提交）；本地 clone 软链（开发方式，见 [LOCAL-DEV.md](./LOCAL-DEV.md)）执行 `git pull --ff-only`。完成后自动重启生效。

### 第一步：一次性初始化（在本机，约 2 分钟）

**① 选一家并创建 OAuth 应用**（二选一，之后在初始化页选同一家）：

| 鉴权方             | 创建入口                                       | 权限                      |
| ------------------ | ---------------------------------------------- | ------------------------- |
| **Gitee**（国内推荐） | <https://gitee.com/oauth/applications>         | 勾选 `user_info`          |
| **GitHub**（海外推荐） | <https://github.com/settings/developers>       | 默认 `read:user` 即可，免审核 |

「**回调地址**」两家都支持登记**多条**（GitHub 上限 10 条），按你的访问方式填（**必须逐字符一致**，含协议与端口）：

| 用途           | 回调地址                                                  |
| -------------- | --------------------------------------------------------- |
| 本机初始化     | `http://127.0.0.1:3081/pocket-oauth/callback`             |
| 你的隧道域名   | `https://你的固定域名/pocket-oauth/callback`              |
| 局域网直连（可选） | `http://你的局域网IP:3081/pocket-oauth/callback`      |

创建后得到 **Client ID** 与 **Client Secret**。

> 💡 GitHub 单回调地址的应用会默认开启「wildcard matching」（可匹配子域/子路径）。逐字符登记全部地址更稳妥；本插件另有 state + 回调白名单两道防线，不受影响。

**② 在本机浏览器打开初始化页**：`http://127.0.0.1:3081/pocket-setup`（设置页「手机访问」里也直接给了这个地址，可一键复制）。**选择 Gitee 或 GitHub**，填入 Client ID / Secret 与上面的**访问地址**，点「保存并绑定账号」。访问地址与创建应用时填**相同内容**即可——把回调地址整条复制过来也行（结尾的 `/pocket-oauth/callback` 会自动去掉）。

**③ 完成绑定**：跳到所选鉴权方授权 → 回到本机页面显示「绑定成功」，该账号已与本机绑定。

### 第二步：自建隧道（人在外面用）

把**固定域名**转发到 `http://127.0.0.1:3081` 即可，工具随意（frp、Tailscale Funnel、自建 nginx 反代、各类内网穿透服务…）。要点：

- **域名必须固定**：两家的回调地址都是精确匹配的，域名一变回调就对不上（这也是本插件不再内置"随机域名隧道"的原因）
- **保持原域名作为 Host 转发**（主流隧道默认行为）：如果把 Host 改写成 `127.0.0.1`，公网流量会被判成本机而免登录
- 隧道地址与回调白名单里的那条**必须完全一致**（`https://` 与 `http://` 算不同地址）

### 第三步：手机访问

手机打开 `https://你的固定域名` → 点「**使用 Gitee 账号登录**」（选 GitHub 时是「**使用 GitHub 账号登录**」，按钮按当前鉴权方变）→ 用**同一个**账号授权 → 进入。界面与电脑完全一致、实时同步。

> **换设备**：任何设备重复第三步即可（账号一致就行），无需重新初始化。
> **换隧道域名**：OAuth 应用回调地址与设置页白名单**两处都要改**，然后重开初始化页保存一次（会要求重新绑定）。
> **换鉴权方（Gitee ⇄ GitHub）**：本机重开初始化页，重选一家并重新绑定（换家即换身份，必须重新绑定）。
> **想撤销所有登录**：设置页「登出所有设备」。

## ⚠️ 安全（必读）

- **DSH 能执行你电脑上的代码**。登录鉴权 = **Gitee 或 GitHub 账号**：只有**初始化时绑定的那个账号（鉴权方 + uid 都对上）**能通过，其他账号（哪怕自己也有 OAuth 应用）一律被拒；两家 uid 撞号也不会误放行
- **本机（loopback）免认证**：能在本机直连就等于已经上了这台机器；正因如此，**初始化页面只在 127.0.0.1 可打开**（远程打开是 403）
- **fail closed**：未配置 Client 凭据、或已配置未绑定账号时，**所有非本机访问一律拒绝**（页面给指引，API 返回 503）
- **隧道请勿改写 Host**：反代把 Host 改成 `127.0.0.1` 时，公网请求会被当成本机而免登录——这是唯一需要你注意的部署细节
- **Client Secret 只存本机**：`$DSH_HOME/dsh-pocket/oauth.json`（权限 0600），设置页与 RPC **永不回显** secret（只显示是否已配置）
- **Gitee / GitHub 只是鉴权方**：它拿不到你电脑上的任何数据；授权换取的 access token 用完即弃，**不落盘**
- **不再有访问密码（PIN）**：非浏览器客户端（curl 等）因此无法再访问 3081——这 OAuth 模型的固有取舍
- **鉴权方不可用时**：外部无法登录（本机 loopback 不受影响）。Gitee 需能出网访问 `gitee.com`；GitHub 需能出网访问 `github.com` **与** `api.github.com`（国内网络下建议选 Gitee）
- **白名单地址即暴露面**：不要把你隧道域名告诉不信任的人；每条白名单地址都能发起登录（但只有绑定账号能通过）
- **本机管理操作有来源校验（防 CSRF）**：保存凭据、发起绑定、登出都会校验请求来源（`Sec-Fetch-Site`/`Origin`）并要求回传进程级随机 nonce——其它网页无法在受害者浏览器里伪造这些本机操作；会话 cookie 在 `https` 入口带 `Secure`（`http` 入口不加，否则浏览器会直接丢弃）

## 🩹 常见问题（别踩的坑）

| 现象                                                     | 原因与解决                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh: command not found` / 提示 DSH 未定义                | dsh CLI 没装：`npm install -g @deepseek-ai/dsh`，或命令前加 `npx @deepseek-ai/dsh`                                                                                                       |
| `ERR_PNPM_ADDING_TO_ROOT`                                | pnpm 9 对 workspace 根的限制：安装/更新命令**末尾加 `-w`**（`--workspace-root`）                                                                                                         |
| 装完/更新了但界面没变化                                  | **必须重启 `dsh web`** 才生效；运行中的进程仍加载旧代码                                                                                                                                  |
| `listen EADDRINUSE ... :3081`                            | 旧进程还占着端口：macOS/Linux `lsof -ti :3081 \| xargs kill -9`；Windows `netstat -ano \| findstr :3081`（找 LISTENING 的 PID）→ `taskkill /PID <PID> /F`，后重试                       |
| 想换端口                                                 | 插件模式：在 `$DSH_HOME/dsh-pocket/settings.json` 写 `"proxyPort": 3082` 后重启 `dsh web`。CLI 模式：`dsh-pocket --port 3082`（注意：回调地址与白名单里的端口要同步改）               |
| 登录报「授权未完成 / redirect_uri 不一致」               | OAuth 应用的回调地址与当前访问地址**没有逐字符一致**（协议、域名、端口、路径都要一样）；改应用回调或改用白名单里的地址                                                            |
| 登录页提示「该账号未绑定本机」                           | 你用了别的账号，或换了鉴权方（Gitee ⇄ GitHub）。换绑：本机打开 `/pocket-setup` 重选一家并重新绑定；或先在设置页「解除绑定」                                                                                                  |
| 选了 GitHub，登录一直失败                                 | GitHub 需要能出网访问 `github.com` **与** `api.github.com` 两个域；国内网络不稳时改用 Gitee（在 `/pocket-setup` 重选并重新绑定）                                                            |
| GitHub 的 token 只有 8 小时，会不会掉线？                | 不会。本插件换到 token 后**立刻取一次用户信息就丢弃**，从不使用、也不保存 token，因此与短时 token / refresh token 无关                                                                         |
| 手机打开一直回到登录页                                   | 浏览器没保存会话 cookie（Safari 在 `http://` + 纯 IP 上会丢 cookie，issue #91 有专门提示页）。换 Chromium 系浏览器，或改用 `https://` 隧道域名                                            |
| 重启电脑后要重新登录                                     | 会话绑定 dsh web 进程（进程级随机密钥），**这是刻意设计**：进程重启即旧会话全部失效                                                                                                                                 |
| 隧道域名变了                                             | OAuth 应用回调地址 + 设置页白名单两处都改，然后重开初始化页保存（需重新绑定）                                                                                                           |
| 点「重启 dsh web」后页面提示进程在后台运行                | 自重启的新进程是 detached 后台进程（不挂终端），是页内更新的标准做法；停止它：macOS/Linux `lsof -ti :3080 \| xargs kill -9`；Windows `netstat -ano \| findstr :3080` → `taskkill /PID <PID> /F` |
| 想手动更新到最新版                                        | 重新安装一次并重启：`dsh plugin --profile web add github:cup113/dsh-pocket-oauth -w`（pnpm 会把版本 pin 到当时的 main 提交）；本地 clone 软链安装则 `git pull` 后重启 `dsh web`                                |

## 💻 DSH Desktop（桌面版）

- 桌面版里 dsh-pocket 的**实时同屏**正常可用；**更新/重启由桌面版管理**（插件内这两项自动停用）
- ⚠️ 桌面端 **advanced 模式**暂不支持手机访问（该模式禁用网页布局、手机拿不到 layout 服务，会白屏）——请切回 **compatibility** 模式后重启；advanced 模式下手机打开会看到明确的提示层

## 🗂 架构（一个 npm 包、两份客户端产物）

> `dsh.bundle` 与 `dsh.client` 都是**包级**声明。手机端 WebUI 以**包内子包**形式交付（`mobile/` = `dsh-pocket-mobile`），它自己声明 `dsh.client` 并提供客户端产物，因此面板里那张卡片有两个可分别开关的组件、手机端组件也有自己的「配置」页。子包的交付机制：`mobile/` 随根包 `package.json` 的 `files` 一起发布，**装完之后**由根包的 `postinstall`（`scripts/link-mobile-package.mjs`）在包内建出 `node_modules/dsh-pocket-mobile -> <包根>/mobile` 链接——DSH 解析那条 row 时只在包内 `node_modules` 里找这个包名，所以链接必须存在。
>
> ⚠️ 从 GitHub 安装时，pnpm 11 会先拦下这个 `postinstall`：命令以 `ERR_PNPM_IGNORED_BUILDS` 失败一次，在**插件面板**点「允许这些脚本并重试」后再跑一次 add 即可（只需一次）。不能改用 `dependencies`/`bundledDependencies`：pnpm 会把 `file:./mobile` 相对 profile 目录解析而直接让安装失败，仓库里提交的 `node_modules/**` 也会在解包时被丢掉。


| 文件                               | 说明                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/index.js`                     | **远程操控**组件入口（row `dsh-pocket`）：自动起代理 + 注册 RPC + OAuth 会话密钥（轮换＝登出所有设备）+ 绑定/解绑/恢复出厂 + 桌面端环境适配                 |
| `lib/oauth.mjs`                    | OAuth 核心：provider 表（Gitee / GitHub 端点、scope、取用户风格）、配置读写（`oauth.json`，0600，含 provider）、state 存储（单次使用 + TTL，携带 provider）、回调 origin 白名单校验、authorize/token/user 调用、会话 cookie 派生          |
| `lib/service.mjs`                  | 服务：代理生命周期（端口自适应）、状态快照（OAuth 视图 + 每条白名单地址的二维码 + 局域网 IP 候选）                                                        |
| `lib/proxy.mjs`                    | 改头反向代理：Host/Origin → loopback，HTTP + WebSocket 透传 + polyfill 注入 + gzip/brotli 压缩 + **认证门**（loopback 免认证 / 其余要 OAuth 会话，fail closed）+ `/pocket-oauth/*`、`/pocket-setup` 路由 |
| `lib/rpc-route.js`                 | RPC 传输层（`lib/web-rpc.js` 用）：webServer 挂载 / `rpc.handle` 回退 / 信任栅栏 / 4xx-5xx 分支（与 dsh-client-connection 的 `/api` 逐分支对齐）；将来移动端宿主半边可经 `dsh-pocket/lib/rpc-route.js` 复用 |
| `lib/settings.mjs`                 | 设置持久化：代理端口 → `$DSH_HOME/dsh-pocket/settings.json`（旧版遗留的 `mobileRightbarEnabled` 孤儿键不再读写，随「恢复出厂设置」清除）                    |
| `lib/clipboard.mjs`                | 剪贴板写入（构建时内联进客户端产物）：`navigator.clipboard` + `execCommand` 兜底                                                                          |
| `lib/web-rpc.js`                   | 远程操控的 loopback RPC（通道 `/dsh-pocket`）：`status` / `oauth.rotateSession` / `oauth.unbind` / `version` / `update` / `restart` / `pocket.reset`        |
| `client/`                          | **远程操控**的客户端产物（`dsh.client` → `client/client.js`）：`index.jsx` 只启用设置页「手机访问」+ `isLoopback` 兜底；`api.js` 为它的契约与工具         |
| `mobile/`                          | **手机端 WebUI** 子包 `dsh-pocket-mobile`：`index.js` 是空壳宿主入口（界面能力全在客户端半边），`locale/` 提供面板行的标题与描述，`package.json` 声明包身份与 `dsh.client` |
| `mobile/client/styles.js`          | 移动端样式的**唯一来源**（纯 JS 导出的 CSS 字符串）：`shellCss` 帧/抽屉几何与面板返回键、`settingsCss`、`composerCss`、`planCss`、`touchCss`。刻意不做 `.css` 文件导入——原生 `node --test` 无法 import CSS |
| `mobile/client/responsive-shell.js` | 视口断点（1024，与 `ui-layout` 的侧边栏自动折叠断点一致）、样式注入与配置投影、抽屉遮罩与幂等开合（只读框架的 `[data-sidebar-collapsed]` 再决定是否调 `toggleSidebar`）、自动收起只认「导航」：会话行被激活或主栏身份真的变了才收起，展开工作区、开 `⋯` 菜单都不收起 |
| `mobile/client/settings-adapter.js` | 设置弹窗两级导航转接器：目录 ↔ 详情状态属性、注入「返回设置」、受「分步导航」开关控制                                                                    |
| `mobile/client/index.jsx`          | 插件入口：注册汉堡按钮到 `conversation.header.leading` 槽位、注册全局面板返回键到 `shell.overlay` 槽位（面板接管主栏时会话连同 header 一起不渲染，汉堡按钮随之消失，这是手机上唯一的回会话入口）、装配上面两个适配器、注册「配置」页 |
| `scripts/link-mobile-package.mjs`  | 根包 `postinstall`：在安装物里建出 `node_modules/dsh-pocket-mobile -> <包根>/mobile`（子包唯一的交付机制）。链接建不出来时只告警不失败——row 是 `required: false`，不该因此弄挂整个插件的安装                              |
| `bin/dsh-pocket.mjs`               | CLI：独立跑同一套代理与 OAuth 配置（`--port` / `--host`）                                                                                                 |

## 🛠 开发

```sh
npm install
npm run build:client    # 重新打包两份客户端产物（client/client.js、mobile/client/client.js）
npm test                # 代理 / OAuth / 压缩 / 握手 / 服务 / RPC / 设置 / 手机端界面 / 打包结构
```

> 改了 `client/**` 或 `mobile/client/**`（以及它们引用的 `lib/*.mjs`）都必须重新打包：产物纳入版本控制，`npm test` 会用「源码重建 ↔ 产物」逐字节比对来防止测试对着旧产物「全绿」。

> 沙箱/受限环境下 `node --test` 会因"每个测试文件派生子进程 + 管道 stdio"被拒：改成逐文件直接跑 `node test/xxx.test.js`；打包同理（esbuild JS API 会派生子进程，可改用 esbuild CLI 产出后再做包装）。

**改完想在本机先试？** 不用发版：把插件换成指向本地仓库的软链，重启 dsh web 就是本地代码。完整步骤（含怎么换回 npm 官方版本）见 [LOCAL-DEV.md](./LOCAL-DEV.md)。

## 🤝 致谢

- 本项目基于 [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket)（原作者：程序员少北晨）改造：把访问密码（PIN）换成 **Gitee / GitHub OAuth 登录**（初始化时二选一），并移除内置隧道（改由用户自建）
- 旧的移动端窄屏适配曾移植自 [mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)（MIT）；那份实现已随官方 WebUI 更新失效并整体移除（源码与版权声明文件一并删除），当前的手机端 WebUI 是按 DSH 现有槽位契约重写的：汉堡按钮走 `conversation.header.leading`，抽屉几何对齐 `AppFrame` 的真实列类名，不再依赖任何被上游改掉的 DOM 结构
- 登录鉴权基于 [Gitee OAuth 2.0](https://gitee.com/api/v5/oauth_doc) 与 [GitHub OAuth apps](https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

## 📄 License

[GPL-2.0](LICENSE) —— 自由软件许可：可自由使用、修改、分发，但**修改版必须同样以 GPL 开源**并保留版权声明；商用同样适用。

> 说明：本仓库曾在 `mobile/` 下移植 dsh-web-mobile（MIT 许可，兼容 GPL）的移动端适配；随官方 WebUI 更新该目录被整体清空，对应的版权声明文件也随原实现一并删除。当前的手机端 WebUI 是按 DSH 现有槽位契约重写的版本；今后若再引入任何第三方移动端代码，请连同其许可证与版权声明一起带回。

---

**有问题？欢迎反馈**：遇到 Bug、有想法、想提需求，请到 [GitHub Issues](https://github.com/cup113/dsh-pocket-oauth/issues) 告诉我们 🙏
