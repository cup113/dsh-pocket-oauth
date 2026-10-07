#!/usr/bin/env node
// dsh-pocket — 独立代理模式（与插件共用同一套代码与 OAuth 配置）
//
// 用法：
//   dsh-pocket                 # 默认监听 0.0.0.0:3081（供自建隧道回连）
//   dsh-pocket --port 3081     # 自定义代理端口（dsh web 保持 3080）
//   dsh-pocket --host 0.0.0.0  # 自定义监听地址
//
// 认证与插件一致：loopback 免认证；其余 Host 要求 OAuth 会话（Gitee 或 GitHub，
// 初始化时二选一）。
// 初始化：本机浏览器打开 http://127.0.0.1:<port>/pocket-setup。
// 前提：dsh web 已在 127.0.0.1:3080 运行。

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createPocketProxy } from '../lib/proxy.mjs';
import { readOAuthConfig, writeOAuthConfig, normalizeProvider } from '../lib/oauth.mjs';

export function parseArgs(argv) {
  const args = {
    port: 3081,
    host: '0.0.0.0',
    upstream: { host: '127.0.0.1', port: 3080 },
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]) || 3081;
    else if (a === '--host') args.host = argv[++i] ?? '0.0.0.0';
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return args;
}

function printHelp() {
  console.log(`dsh-pocket — 远程访问电脑上的 DeepSeek Harness（Gitee / GitHub OAuth 登录）

用法：
  dsh-pocket              监听 0.0.0.0:3081（自建隧道指向该端口）
  dsh-pocket --port 3081  自定义代理端口
  dsh-pocket --host ...   自定义监听地址
  dsh-pocket --help       帮助

初始化（一次）：本机浏览器打开 http://127.0.0.1:3081/pocket-setup，
选 Gitee 或 GitHub 创建 OAuth 应用并绑定该账号；此后任意设备经白名单地址
用同一账号登录即可。

前提：dsh web 已在 127.0.0.1:3080 运行（npx @deepseek-ai/dsh web）。
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('🚀 dsh-pocket 启动中…');
  const session = { key: randomBytes(16).toString('hex') };
  const { port, close } = await createPocketProxy({
    ...args,
    auth: {
      sessionKey: () => session.key,
      getConfig: readOAuthConfig,
      saveConfig: writeOAuthConfig,
      bindUser: (user) => {
        const cfg = readOAuthConfig() ?? { clientId: '', clientSecret: '', callbackOrigins: [] };
        return writeOAuthConfig({
          ...cfg,
          provider: normalizeProvider(user?.provider ?? cfg.provider),
          boundUid: String(user.id),
          boundLogin: user.login,
        });
      },
    },
  });

  console.log(`\n⚙️  初始化 / 绑定账号（本机浏览器打开）：http://127.0.0.1:${port}/pocket-setup`);
  console.log(`   监听 ${args.host}:${port}；自建隧道（固定域名）指向该端口即可远程访问。`);
  console.log(`   本机（127.0.0.1）免认证；其余地址需 OAuth 登录（Gitee 或 GitHub）。`);

  const shutdown = async () => {
    console.log('\n👋 dsh-pocket 已退出 | bye');
    await close().catch(() => {});
    process.exit(130);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  console.log(`✅ dsh-pocket 已就绪。按 Ctrl+C 停止。`);
  await new Promise(() => {});
}

// 只有被直接执行时才启动（测试里 import 本文件拿纯函数时不能把服务跑起来）。
// npm 会把 bin 装成 symlink，argv[1] 是 symlink 路径而 import.meta.url 是真实路径，
// 所以必须先 realpath 再比较，否则装完的 CLI 会变成什么都不做。
const isDirectRun = (() => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((err) => {
    console.error(`❌ dsh-pocket: ${err?.message ?? err}`);
    process.exit(1);
  });
}
