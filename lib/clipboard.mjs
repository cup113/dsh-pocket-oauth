// 剪贴板写入（浏览器端共享实现）：设置页「手机访问」用它复制回调地址 / 排障上下文。
//
// 通过 `dsh-pocket/lib/clipboard.mjs` 引入（根 package.json 的 exports["./lib/*"]，
// 手机端子包将来也可以直接复用），esbuild 打包时内联进产物，所以这里只允许
// 浏览器 API，不许出现 Node 依赖。

/**
 * 写剪贴板：优先 navigator.clipboard（安全上下文），非安全上下文（局域网 http://IP 入口）
 * 回退 execCommand——否则手机上点「复制」会静默失败。
 * @param {string} text 待复制文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 回退 execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
