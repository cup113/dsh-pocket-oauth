module.exports = {
  branches: ['main'],
  // 本仓库不发 npm：包名 `dsh-pocket` 属于上游作者（npm 上那是 PIN 模型的另一个应用），
  // 一旦挂上 @semantic-release/npm，Release workflow 就会往别人的包推版本。
  // 发版只做：CHANGELOG + package.json 版本号 + git tag + GitHub release。
  // 版本号没有 @semantic-release/npm 可依赖，由本地 prepare 插件统一写根包 / 锁文件 / mobile 子包
  //（mobile 子包缺 version 会触发 DSH 的 DeepSeek 请求扩展 REQUEST_EXTENSION）。
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      { changelogFile: 'CHANGELOG.md' },
    ],
    './scripts/sync-release-version.mjs',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      { assets: ['CHANGELOG.md', 'package.json', 'package-lock.json', 'mobile/package.json'] },
    ],
  ],
}
