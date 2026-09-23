<p align="center">
  <img src="docs/banner.jpg" alt="DSH Pocket" width="100%">
</p>

<h1 align="center">DSH Pocket</h1>

<p align="center"><a href="README.en.md">English</a> | <a href="README.md">中文</a></p>

<p align="center">
  <a href="https://github.com/cup113/dsh-pocket-oauth/actions"><img alt="CI" src="https://github.com/cup113/dsh-pocket-oauth/actions/workflows/test.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-GPL--2.0-red.svg"></a>
  <a href="https://github.com/cup113/dsh-pocket-oauth/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/cup113/dsh-pocket-oauth"></a>
  <a href="https://awesome-dsh-plugin.com/zh/"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
</p>

> 把 **DeepSeek Harness 装进你的口袋**：插件只开一个端口（3081），用 **Gitee OAuth 登录**代替访问密码，**隧道由你自己建**——手机随时实时看到电脑上的同一个界面。

<p align="center">
  ⭐ 顺手留颗 Star，作者能高兴一整天 &nbsp;·&nbsp; <a href="https://github.com/cup113/dsh-pocket-oauth">行，给你一颗 Star</a>
</p>

## 这是什么

**你不在电脑前，也想用电脑上的 DeepSeek Harness。**

- 下班路上，agent 在电脑上跑任务，你想掏出手机看看它干到哪了、结果如何
- 出门在外，突然想让电脑上的 agent 查点资料、写段代码，但没有远程桌面、没有 SSH
- 电脑在宿舍/办公室，你人在外面，想随时"操控你的 DeepSeek Harness"——发任务、看输出、点审批

DSH Pocket 就是干这个的：**只暴露一个端口，登录一次 Gitee 账号，手机就能实时看到并操控电脑上的 DeepSeek Harness 界面**。

实际效果——手机上的界面就是电脑上的界面，实时同步：

<p align="center">
  <img src="docs/interface.jpg" alt="手机上的 DSH 界面" width="100%">
</p>

## ✨ 特性

| 特性                | 说明                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🚪 单端口           | 只暴露 **3081**（代理），把入站 Host/Origin 改写成 loopback 后转发给本机 dsh web——**不需要改 dsh 的任何配置**，也不碰 dsh 官方禁用的 0.0.0.0 绑定             |
| 🔐 Gitee OAuth 登录 | **彻底取代访问密码**：本机初始化时绑定你的 Gitee 账号（uid），此后任何设备经白名单地址打开，用**同一个 Gitee 账号**登录即进入                          |
| 🔗 多回调白名单     | Gitee 应用的「应用回调地址」可登记多条：本机 `http://127.0.0.1:3081/...`、隧道固定域名 `https://你的域名/...`、可选局域网 IP——**当前访问地址在哪条白名单里，就用哪条回调** |
| 🏠 本机免登录       | `127.0.0.1` / `localhost` 直连免认证（能在本机直连本来就已经上了这台机器），初始化页面也只在**本机**可打开                                                       |
| 🧱 未初始化即全拒   | 没配置凭据/没绑定账号时，所有非本机访问一律拒绝（**fail closed**），不会出现"装完就裸奔"                                                                        |
| 🌐 隧道自建         | 插件**不管理任何隧道**：你用 frp / Tailscale Funnel / 自建 nginx 反代 / 各类内网穿透，把**固定域名**指到 `http://127.0.0.1:3081` 即可（需要固定域名，原因见下）     |
| 📱 地址二维码       | 设置页为每条白名单地址生成二维码，手机扫码打开后点「使用 Gitee 账号登录」                                                                                        |
| 🧘 会话保持         | 登录后种 HttpOnly 会话 cookie（30 天），**长期免输**；登录状态绑定电脑上的 dsh web 进程——**重启/更新后需重新登录一次**                                          |
| 🚪 一键登出         | 「登出所有设备」= 轮换进程级会话密钥，所有已登录设备立即失效（换手机、怀疑泄露时用）                                                                             |
| ⚡ 实时同步         | 流式输出走 WebSocket 全透传——**电脑上在输出，手机上同步在滚**，可双向操作；内置心跳保活（防 NAT/省电机制静默断链，断线自动重连）                                 |
| 📱 移动端适配       | 窄屏自动变抽屉布局（移植 dsh-web-mobile，MIT）：侧栏抽屉、会话全宽、状态栏安全区、触控优化                                                                       |
| 🧭 可选右边栏       | 手机端显示原生右边栏入口；普通手机可在设置中关闭以保持紧凑，折叠屏展开后可更方便地同时使用终端底栏和右边栏                                                       |
| 📁 文件浏览         | 移动端「文件浏览」入口需要宿主提供 explorer 面板（dsh-web-ui 组件）；官方 DSH 未内置时入口自动隐藏，不会出现"点了没反应"                                         |
| 🗜️ 传输压缩         | 大 JSON 响应自动 gzip/brotli（长会话 17MB → ~1MB，brotli 质量 6：快且省流量），手机加载更快、更省流量                                                            |
| 🧩 零额外服务       | 一个 npm 包、一个设置页；不需要自建服务器或中继（登录用你自己的 Gitee 账号）                                                                                     |

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
# 1. 装本仓库（从源码软链进 profile；路径换成你 clone 下来的目录）
git clone https://github.com/cup113/dsh-pocket-oauth.git
dsh plugin --profile web add link:/绝对路径/dsh-pocket-oauth -w

# 2. 重启 dsh web
npx @deepseek-ai/dsh web
```

> ⚠️ npm 上的 `dsh-pocket` 是**原版**（PIN 版，不是本仓库）。源码安装时界面上的「一键更新」指向的正是那个 npm 原版——**别点**（会把 profile 里的软链换成 npm 原版）；更新本仓库请 `git pull` 后重启 dsh web。

### 第一步：一次性初始化（在本机，约 2 分钟）

**① 在 Gitee 创建 OAuth 应用**：打开 <https://gitee.com/oauth/applications> → 创建应用。「**应用回调地址**」支持登记**多条**，按你的访问方式填（**必须逐字符一致**，含协议与端口）：

| 用途           | 回调地址                                                  |
| -------------- | --------------------------------------------------------- |
| 本机初始化     | `http://127.0.0.1:3081/pocket-oauth/callback`             |
| 你的隧道域名   | `https://你的固定域名/pocket-oauth/callback`              |
| 局域网直连（可选） | `http://你的局域网IP:3081/pocket-oauth/callback`      |

创建后得到 **Client ID** 与 **Client Secret**。

**② 在本机浏览器打开初始化页**：`http://127.0.0.1:3081/pocket-setup`（设置页「手机访问」里也直接给了这个地址，可一键复制）。填入 Client ID / Secret 与上面的**访问地址（每行一条，即回调白名单）**，点「保存并绑定 Gitee 账号」。

**③ 完成绑定**：跳到 Gitee 授权 → 回到本机页面显示「绑定成功」，你的 Gitee 账号已与本机绑定。

### 第二步：自建隧道（人在外面用）

把**固定域名**转发到 `http://127.0.0.1:3081` 即可，工具随意（frp、Tailscale Funnel、自建 nginx 反代、各类内网穿透服务…）。要点：

- **域名必须固定**：Gitee 的回调地址是精确匹配的，域名一变回调就对不上（这也是本插件不再内置"随机域名隧道"的原因）
- **保持原域名作为 Host 转发**（主流隧道默认行为）：如果把 Host 改写成 `127.0.0.1`，公网流量会被判成本机而免登录
- 隧道地址与回调白名单里的那条**必须完全一致**（`https://` 与 `http://` 算不同地址）

### 第三步：手机访问

手机打开 `https://你的固定域名` → 点「**使用 Gitee 账号登录**」→ 用**同一个** Gitee 账号授权 → 进入。界面与电脑完全一致、实时同步。

> **换设备**：任何设备重复第三步即可（账号一致就行），无需重新初始化。
> **换隧道域名**：Gitee 应用回调地址与设置页白名单**两处都要改**，然后重开初始化页保存一次（会要求重新绑定）。
> **想撤销所有登录**：设置页「登出所有设备」。

## ⚠️ 安全（必读）

- **DSH 能执行你电脑上的代码**。登录鉴权 = **Gitee 账号**：只有**初始化时绑定的那个 Gitee uid** 能通过，其他账号（哪怕自己也有 OAuth 应用）一律被拒
- **本机（loopback）免认证**：能在本机直连就等于已经上了这台机器；正因如此，**初始化页面只在 127.0.0.1 可打开**（远程打开是 403）
- **fail closed**：未配置 Client 凭据、或已配置未绑定账号时，**所有非本机访问一律拒绝**（页面给指引，API 返回 503）
- **隧道请勿改写 Host**：反代把 Host 改成 `127.0.0.1` 时，公网请求会被当成本机而免登录——这是唯一需要你注意的部署细节
- **Client Secret 只存本机**：`$DSH_HOME/dsh-pocket/oauth.json`（权限 0600），设置页与 RPC **永不回显** secret（只显示是否已配置）
- **Gitee 只是鉴权方**：它拿不到你电脑上的任何数据；授权换取的 access token 用完即弃，**不落盘**
- **不再有访问密码（PIN）**：非浏览器客户端（curl 等）因此无法再访问 3081——这 OAuth 模型的固有取舍
- **Gitee 不可用时**：外部无法登录（本机 loopback 不受影响）。若你在封闭网络里长期用，请留意这一点
- **白名单地址即暴露面**：不要把你隧道域名告诉不信任的人；每条白名单地址都能发起登录（但只有绑定账号能通过）

## 🩹 常见问题（别踩的坑）

| 现象                                                     | 原因与解决                                                                                                                                                                              |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh: command not found` / 提示 DSH 未定义                | dsh CLI 没装：`npm install -g @deepseek-ai/dsh`，或命令前加 `npx @deepseek-ai/dsh`                                                                                                       |
| `ERR_PNPM_ADDING_TO_ROOT`                                | pnpm 9 对 workspace 根的限制：安装/更新命令**末尾加 `-w`**（`--workspace-root`）                                                                                                         |
| 装完/更新了但界面没变化                                  | **必须重启 `dsh web`** 才生效；运行中的进程仍加载旧代码                                                                                                                                  |
| `listen EADDRINUSE ... :3081`                            | 旧进程还占着端口：macOS/Linux `lsof -ti :3081 \| xargs kill -9`；Windows `netstat -ano \| findstr :3081`（找 LISTENING 的 PID）→ `taskkill /PID <PID> /F`，后重试                       |
| 想换端口                                                 | 插件模式：在 `$DSH_HOME/dsh-pocket/settings.json` 写 `"proxyPort": 3082` 后重启 `dsh web`。CLI 模式：`dsh-pocket --port 3082`（注意：Gitee 回调地址与白名单里的端口要同步改）               |
| 登录报「授权未完成 / redirect_uri 不一致」               | Gitee 应用的回调地址与当前访问地址**没有逐字符一致**（协议、域名、端口、路径都要一样）；改 Gitee 应用回调或改用白名单里的地址                                                            |
| 登录页提示「该 Gitee 账号未绑定本机」                    | 你用了别的 Gitee 账号。换绑：本机打开 `/pocket-setup` 重新绑定；或先在设置页「解除绑定」                                                                                                  |
| 手机打开一直回到登录页                                   | 浏览器没保存会话 cookie（Safari 在 `http://` + 纯 IP 上会丢 cookie，issue #91 有专门提示页）。换 Chromium 系浏览器，或改用 `https://` 隧道域名                                            |
| 重启电脑后要重新登录                                     | 会话绑定 dsh web 进程（进程级随机密钥），**这是刻意设计**：进程重启即旧会话全部失效                                                                                                                                 |
| 隧道域名变了                                             | Gitee 应用回调地址 + 设置页白名单两处都改，然后重开初始化页保存（需重新绑定）                                                                                                           |
| 点「重启 dsh web」后页面提示进程在后台运行                | 自重启的新进程是 detached 后台进程（不挂终端），是页内更新的标准做法；停止它：macOS/Linux `lsof -ti :3080 \| xargs kill -9`；Windows `netstat -ano \| findstr :3080` → `taskkill /PID <PID> /F` |
| 版本停在 0.x 升不上去                                     | `^0.x` 范围不允许升到 1.x：更新用 `--latest`（`dsh plugin --profile web update dsh-pocket --latest -w`）                                                                                 |

## 💻 DSH Desktop（桌面版）

- 桌面版里 dsh-pocket 的**实时同屏**正常可用；**更新/重启由桌面版管理**（插件内这两项自动停用）
- ⚠️ 桌面端 **advanced 模式**暂不支持手机访问（该模式禁用网页布局、手机拿不到 layout 服务，会白屏）——请切回 **compatibility** 模式后重启；advanced 模式下手机打开会看到明确的提示层

## 🗂 架构（单包）

| 文件                 | 说明                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/index.js`       | 插件入口：自动起代理 + 注册 RPC + OAuth 会话密钥（轮换＝登出所有设备）+ 绑定/解绑/恢复出厂 + 桌面端环境适配                                              |
| `lib/oauth.mjs`      | Gitee OAuth 核心：配置读写（`oauth.json`，0600）、state 存储（单次使用 + TTL）、回调 origin 白名单校验、authorize/token/user 调用、会话 cookie 派生          |
| `lib/service.mjs`    | 服务：代理生命周期（端口自适应）、状态快照（OAuth 视图 + 每条白名单地址的二维码 + 局域网 IP 候选）                                                        |
| `lib/proxy.mjs`      | 改头反向代理：Host/Origin → loopback，HTTP + WebSocket 透传 + polyfill 注入 + gzip/brotli 压缩 + **认证门**（loopback 免认证 / 其余要 OAuth 会话，fail closed）+ `/pocket-oauth/*`、`/pocket-setup` 路由 |
| `lib/settings.mjs`   | 设置持久化：代理端口 + 手机端右边栏（`$DSH_HOME/dsh-pocket/settings.json`）                                                                                |
| `lib/web-rpc.js`     | loopback RPC：`status` / `oauth.rotateSession` / `oauth.unbind` / `mobile.rightbar.setEnabled` / `version` / `update` / `restart` / `pocket.reset` / `pocket.fileRead` |
| `client/`            | 设置页「手机访问」（初始化引导 + 绑定状态 + 二维码）+ 移动端适配（dsh-web-mobile 移植）                                                                    |
| `bin/dsh-pocket.mjs` | CLI：独立跑同一套代理与 OAuth 配置（`--port` / `--host`）                                                                                                 |

## 🛠 开发

```sh
npm install
node client/build.mjs   # 改 client/ 后重新打包（客户端 bundle）
npm test                # 代理 / OAuth / 压缩 / 握手 / 服务 / RPC / 设置 / 移动端
```

> 沙箱/受限环境下 `node --test` 会因"每个测试文件派生子进程 + 管道 stdio"被拒：改成逐文件直接跑 `node test/xxx.test.js`；打包同理（esbuild JS API 会派生子进程，可改用 esbuild CLI 产出后再做包装）。

**改完想在本机先试？** 不用发版：把插件换成指向本地仓库的软链，重启 dsh web 就是本地代码。完整步骤（含怎么换回 npm 官方版本）见 [LOCAL-DEV.md](./LOCAL-DEV.md)。

## 🤝 致谢

- 本项目基于 [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket)（原作者：程序员少北晨）改造：把访问密码（PIN）换成 **Gitee OAuth 登录**，并移除内置隧道（改由用户自建）
- 移动端适配移植自 [mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)（MIT）
- 登录鉴权基于 [Gitee OAuth 2.0](https://gitee.com/api/v5/oauth_doc)

## 📄 License

[GPL-2.0](LICENSE) —— 自由软件许可：可自由使用、修改、分发，但**修改版必须同样以 GPL 开源**并保留版权声明；商用同样适用。

> 说明：移动端适配部分移植自 [dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)（MIT 许可，兼容 GPL），其版权声明保留在 `client/mobile/LICENSE.dsh-web-mobile`。

---

**有问题？欢迎反馈**：遇到 Bug、有想法、想提需求，请到 [GitHub Issues](https://github.com/cup113/dsh-pocket-oauth/issues) 告诉我们 🙏
