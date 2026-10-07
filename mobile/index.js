// dsh-pocket「手机端 WebUI」组件的宿主半边（Loader row: dsh-pocket-mobile）。
//
// 架构设计：
//   - 本组件是根包（dsh-pocket）的子包（mobile/），随根包 bundledDependencies 随包安装；
//   - 手机端的全部体验优化（抽屉侧边栏、移动端设置分步导航、防截断触屏输入框、Plan 预览及审批）
//     均由客户端半边（mobile/client/index.jsx → mobile/client/client.js）接管与呈现；
//   - 宿主半边保持轻量解耦，无需常驻后台服务。

export const name = 'dsh-pocket-mobile';

export const inject = [];

export function apply(ctx) {}
