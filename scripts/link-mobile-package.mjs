// 仓库内的两条软链（提交在 git 里；pnpm 做 git 安装时会把它们**解引用**打进安装物）：
//
//   node_modules/dsh-pocket-mobile -> ../mobile   手机端 WebUI 组件的子包（根 package.json 的
//                                                 dependencies + bundledDependencies 指向它；
//                                                 独立客户端包，安装态必须解析得到）
//   node_modules/dsh-pocket        -> ..          开发态自引用：给将来移动端 WebUI 的宿主半边
//                                                 import 'dsh-pocket/lib/*' 预留（当前无引用者）
//
// `npm install` / `npm ci` 会把它们换成副本或直接删掉（junctions 在 Windows 上也是），
// 所以构建与测试之前先跑这个脚本复原；打完包（pnpm pack / npm pack）时自引用那条会被
// packlist 自动丢弃，bundled 的那条才会进安装物。

import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 本仓库根目录（包根）。 */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 需要存在的软链：相对目标 + 期望指向（相对与绝对两种写法都算命中）。 */
export const LINKS = Object.freeze([
  { path: join(packageRoot, 'node_modules/dsh-pocket-mobile'), target: '../mobile' },
  { path: join(packageRoot, 'node_modules/dsh-pocket'), target: '..' },
]);

/**
 * 复原一条软链：已经是正确软链就跳过，否则删掉（副本目录/文件）重建。
 * @param {{path:string, target:string}} link 软链路径与相对目标
 * @param {string} [platform] 目标平台（测试注入用）
 * @returns {Promise<'ok'|'relinked'>} 是否发生了改动
 */
export async function ensureLink(link, platform = process.platform) {
  const absoluteTarget = resolve(dirname(link.path), link.target);
  const current = await lstat(link.path).catch(() => null);
  if (current?.isSymbolicLink()) {
    const target = await readlink(link.path).catch(() => null);
    if (target === link.target || target === absoluteTarget) return 'ok';
  }
  await mkdir(dirname(link.path), { recursive: true });
  await rm(link.path, { recursive: true, force: true });
  // Windows 的 junction 不接受相对目标；Linux/macOS 用目录软链。
  await symlink(platform === 'win32' ? absoluteTarget : link.target, link.path, platform === 'win32' ? 'junction' : 'dir');
  return 'relinked';
}

/** 复原全部软链，打印实际改动。 @returns {Promise<string[]>} 被重建的路径 */
export async function ensureLinks() {
  const changed = [];
  for (const link of LINKS) {
    if ((await ensureLink(link)) === 'relinked') {
      changed.push(link.path);
      console.log(`linked ${link.path} -> ${link.target}`);
    }
  }
  return changed;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureLinks();
}
