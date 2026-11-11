module.exports = {
  branches: ['main'],
  // semantic-release 只负责：CHANGELOG + 版本号 + git tag + GitHub Release。
  // npm 发布（@ds-hu/dsh-pocket，作用域是 ds-hu，不是上游那个 dsh-pocket）由
  // Release workflow 里独立的 `npm publish` 步骤完成，**刻意不挂 @semantic-release/npm**：
  // 版本号要由本地 prepare 插件统一写根包 / 锁文件 / mobile 子包（mobile 子包缺 version
  // 会触发 DSH 的 DeepSeek 请求扩展 REQUEST_EXTENSION），再让 @semantic-release/npm
  // 去写一次 package.json 会和它抢同一个字段。
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      { changelogFile: 'CHANGELOG.md' },
    ],
    './scripts/sync-release-version.mjs',
    [
      '@semantic-release/github',
      {
        // 仓库历史里带着旧仓库的 PR/issue 引用（#117、#122 …），在 ds-hu 下这些编号
        // 不存在，success 步骤按 release notes 里的 `#123` 去评论会直接抛错、把整次
        // 发版标成失败（npm 发布步骤随之被跳过）。发版不需要自动评论/打标签。
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
    [
      '@semantic-release/git',
      { assets: ['CHANGELOG.md', 'package.json', 'package-lock.json', 'mobile/package.json'] },
    ],
  ],
}
