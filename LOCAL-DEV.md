# 本地联调（开发软链）

改完代码想在本机 dsh web 里直接验证，**不用发版**——把已安装的插件换成指向本地仓库的软链即可。

原理：dsh 的插件装在 profile 的 `node_modules` 里（pnpm 软链），我们把它重新指向本地仓库目录，dsh web 重启后就加载本地代码。

---

## 一、建立软链（只需做一次）

```sh
# 插件安装位置：$DSH_HOME/profiles/web/node_modules/dsh-pocket（默认 $DSH_HOME=~/.dsh）
# 若你改过 DSH_HOME，把下面的 ~/.dsh 换成实际路径
cd ~/.dsh/profiles/web/node_modules

rm dsh-pocket
ln -s /你的/仓库/绝对路径/dsh-pocket dsh-pocket

# 确认
ls -l dsh-pocket
# dsh-pocket -> /你的/仓库/绝对路径/dsh-pocket
```

桌面版 profile 同理，把路径里的 `web` 换成 `desktop` 即可。

## 二、日常改代码流程

| 改了哪里 | 要做什么 |
| --- | --- |
| `lib/**`（远程操控组件的宿主半边 + 传输层/设置模块） | 直接重启 dsh web 生效 |
| `mobile/index.js`（手机端组件的宿主半边，空壳） | 直接重启 dsh web 生效 |
| `client/**`（远程操控的客户端产物源码） | 先 `npm run build:client` 打包，再刷新页面 |
| `mobile/client/**`（手机端 WebUI 的客户端源码：`styles.js` / `responsive-shell.js` / `settings-adapter.js` / `index.jsx`） | 先 `npm run build:client` 打包成 `mobile/client/client.js`，再刷新页面 |
| `mobile/package.json`、`mobile/locale/**`（面板那条 row 的包身份与标题描述） | 重启 dsh web 生效（无产物要打） |
| `package.json` 里的子包依赖 / 软链（`node_modules/dsh-pocket-mobile`、`node_modules/dsh-pocket`） | 跑 `node scripts/link-mobile-package.mjs` 复原（`npm run build:client` 里也带） |

```sh
npm run build:client      # 打包客户端产物 + 复原仓库内软链（只改后端可跳过）
npm test                  # 建议顺手跑一遍（沙箱内 `node --test` 会被拒时，改为逐文件 node test/xxx.test.js）
```

> **为什么仓库里会有 `node_modules` 软链**：手机端组件是包内子包 `dsh-pocket-mobile`（`mobile/` 是它的源码），面板那条 row 的名字必须解析得到这个包，所以 `node_modules/dsh-pocket-mobile -> ../mobile` 是打包时被解引用进安装物的那条软链。它声明了 `dsh.client`、带客户端产物 `mobile/client/client.js`，软链与 `file:` 依赖照旧保留。
> `node_modules/dsh-pocket -> ..` 是开发态自引用：**当前没有引用者**，留给将来移动端宿主半边（子包里的 `import 'dsh-pocket/lib/*'` 需要它才能在开发态解析）。
> `npm install` / `npm ci` 会把这两条换成副本或删掉，所以构建/测试前一定先跑 `scripts/link-mobile-package.mjs`（`npm run build:client`、`npm test` 的 pretest 都会自动跑）。

### 两个组件怎么验证

包里有两条 Loader row（`cordis.patch.yml`），装好后在 **侧边栏 → 插件 → dsh-pocket** 卡片里应能看到「包含的组件 共 2 个」与两个独立开关：

| 组件行 | 期望 |
| --- | --- |
| `dsh-pocket`（远程操控） | 关掉后 3081 不再监听、设置里没有「手机访问」；页面/手机端照常打开官方界面 |
| `dsh-pocket-mobile`（手机端 WebUI） | 面板里有「配置」按钮，可开关遮罩、输入框优化、设置分步导航；**把浏览器窗口缩到 1024px 以下**即可看到移动端排版（左上汉堡按钮 → 抽屉侧边栏） |
| 只开手机端 | 窄屏排版生效；远程操控那半边的功能（代理 / OAuth）不可用 |

改了 `cordis.patch.yml` 的行结构后，可以先不重启、只用 CLI 验证组合结果：

```sh
dsh --profile web --dump-config | grep -A 3 '== dsh-pocket'
# 期望看到两条：- id: dsh-pocket / - id: dsh-pocket-mobile（都是裸包名）
```

### 重启 dsh web

直接 `kill` 后用 `nohup` 拉起**会被终端会话回收**，必须用 detached 方式（和插件自带的自重启同一套做法）：

```sh
# 1) 停掉当前 dsh web
kill $(lsof -ti :3080 -sTCP:LISTEN)

# 2) detached 重新拉起（日志在 /tmp/dsh-web-dev.log）
node -e "
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const out = fs.openSync('/tmp/dsh-web-dev.log', 'a');
const err = fs.openSync('/tmp/dsh-web-dev.log', 'a');
spawn('$(command -v dsh)', ['web'], {
  detached: true, stdio: ['ignore', out, err], env: process.env, cwd: process.env.HOME,
}).unref();
"

# 3) 等服务起来
curl -s -o /dev/null -w "3080:%{http_code}\n" http://127.0.0.1:3080/   # dsh web
curl -s -o /dev/null -w "3081:%{http_code}\n" http://127.0.0.1:3081/   # dsh-pocket 代理
```

## 三、确认加载的确实是本地代码

页面引用的 `client.js` 带一个 `rev` 参数，它是打包产物内容的 sha1 前 12 位。比对一下就知道有没有生效：

```sh
# 页面正在引用的版本
REV=$(curl -s http://127.0.0.1:3080/ | grep -o 'dsh-pocket/client.js?rev=[a-f0-9]*' | head -1 | cut -d= -f2)
echo $REV

# 本地打包产物的 sha1 前 12 位
shasum -a 1 client/client.js | cut -c1-12
```

两者一致 = 本地代码已生效。

## 四、换回 GitHub 版本（当前默认安装方式）

```sh
dsh plugin --profile web add github:cup113/dsh-pocket-oauth
```

重装会把软链换成从仓库 main 拉取的正式安装（包名是 `dsh-pocket`，仓库名是 `dsh-pocket-oauth`）：

```sh
ls -l ~/.dsh/profiles/web/node_modules/dsh-pocket      # 真实目录，不再是软链
grep -A2 'dsh-pocket:' ~/.dsh/profiles/web/pnpm-lock.yaml
# specifier: github:cup113/dsh-pocket-oauth
# version: https://codeload.github.com/cup113/dsh-pocket-oauth/tar.gz/<提交>
```

之后重启 dsh web 即可。pnpm 会把结果 pin 在当时的 main 提交上——想跟上新提交，再跑一次上面的命令。

> 设置页的「一键更新」会探测安装方式并自动选择正确动作：本地 clone 软链（`link:`）安装执行 `git pull --ff-only`，`github:` 规格安装重跑上面的 add 命令；两者成功后都会自动重启生效。

---

## 注意事项

- **软链期间，你日常用的 dsh web 跑的都是本地仓库代码**（包括未提交的改动），而别人通过 npm 装到的仍是发布版——两边互不影响。
- 本地仓库需要装过依赖（`npm install`），否则 `lib/` 用到的 `cordis` / `cosmokit` 等解析不到，插件会静默加载失败。
- 改完 `client/` 或 `mobile/client/` 忘了打包，界面不会变（dsh web 加载的是 `client/client.js` 与 `mobile/client/client.js` 产物，不是 `.jsx` / `.js` 源码）。
- 电脑重启后自己正常启动 dsh web 即可，软链是持久的，仍然加载本地代码。

## 常见问题

**手机页面没变化**：先确认 dsh web 重启成功（看 `/tmp/dsh-web-dev.log`）；如果改的是 `client/**` 或 `mobile/client/**`，多半是忘了 `npm run build:client`，再刷新页面（客户端产物的进出在下一次页面加载时生效）。

**手机上是桌面排版、没有汉堡按钮**：移动端排版只在窗口宽度 < 1024px 时生效（与 DSH 框架折叠侧边栏的断点一致）。桌面浏览器把窗口缩窄即可复现；手机上先用「插件 → dsh-pocket」卡片确认 `dsh-pocket-mobile` 是开着的。

**代理端口 3081 起不来**：插件没加载成功。检查软链路径是否正确、仓库依赖是否装好；也可以 `curl -s http://127.0.0.1:3080/` 看返回的 HTML 里有没有 `dsh-pocket/client.js`。

**端口被占**：`lsof -ti :3080` 或 `lsof -ti :3081` 查占用进程；dsh-pocket 的代理在 3081 被占时会自动顺延到下一个端口。
