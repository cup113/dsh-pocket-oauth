// dsh-pocket 网页客户端打包：
//   - client/index.jsx → client/client.js（loader id: dsh-pocket 远程操控）
//   - mobile/client/index.jsx → mobile/client/client.js（loader id: dsh-pocket-mobile 手机端 WebUI）
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceDir, '..');

/**
 * 打包目标：入口、默认产物路径、loader id、以及一致性测试用的产物覆盖环境变量。
 * 只要设置了任意一个 OUT 环境变量，就**只**构建被覆盖的目标——测试不会顺手改写工作区里
 * 另一份产物（那会让「源码 ↔ 产物」一致性校验失去意义）。
 */
export const TARGETS = Object.freeze([
  {
    id: process.env.DSH_POCKET_CLIENT_ID ?? 'dsh-pocket',
    entry: resolve(packageRoot, 'client/index.jsx'),
    output: resolve(packageRoot, 'client/client.js'),
    override: process.env.DSH_POCKET_CLIENT_OUT,
  },
  {
    id: process.env.DSH_POCKET_MOBILE_CLIENT_ID ?? 'dsh-pocket-mobile',
    entry: resolve(packageRoot, 'mobile/client/index.jsx'),
    output: resolve(packageRoot, 'mobile/client/client.js'),
    override: process.env.DSH_POCKET_MOBILE_CLIENT_OUT,
  },
]);

/**
 * 把 esbuild 产物包进 DSH 客户端模块系统的注册包装。
 * @param {string} bundled esbuild 产出的 CJS 代码
 * @param {string} loaderId 图行 id（= 包名）
 * @returns {string} 可被页面直接执行的注册脚本
 */
export function wrapBundle(bundled, loaderId) {
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(loaderId)},
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
${bundled}
    return module.exports;
  }
});
`;
}

/**
 * 构建一个目标。
 * @param {{id:string, entry:string, output:string, override?:string}} target 目标描述
 * @returns {Promise<string>} 实际写入的路径
 */
export async function buildTarget(target) {
  const result = await build({
    entryPoints: [target.entry],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome100'],
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
    write: false,
    minify: process.env.NODE_ENV === 'production',
    legalComments: 'none',
    loader: {
      '.css': 'text',
    },
  });
  const bundled = result.outputFiles?.[0]?.text;
  if (!bundled) throw new Error(`esbuild did not produce a client bundle for ${target.id}`);
  const outputPath = target.override ? resolve(target.override) : target.output;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, wrapBundle(bundled, target.id), 'utf8');
  return outputPath;
}

const overridden = TARGETS.some((target) => target.override !== undefined && target.override !== '');
const selected = overridden ? TARGETS.filter((target) => target.override !== undefined && target.override !== '') : TARGETS;
for (const target of selected) console.log(`Wrote ${await buildTarget(target)}`);
