# 手绘角色独立演示

访问 `/hand-drawn-character/index.html`。这是独立 HTML 页面，与主入口 `/` 的房间保持分离；无需登录，也不会保存输入。

原始作者：byteab（Ehsan sarshar）。

来源：https://gist.github.com/byteab/06d251617c670840f4889d3a032a0e7e

原始文件：`hand-drawn-character-creator.html`。保留原有角色生成和动画逻辑，仅将 Three.js 的 import map 从 CDN 改为同目录的本地模块，避免运行时依赖该 CDN。Google Fonts 字体仍通过网络加载。

`three.module.js` 为 Three.js 0.160.0，来源 https://unpkg.com/three@0.160.0/build/three.module.js ，MIT 许可证见 `THREE-LICENSE.txt`。它与房间使用的 npm 版 Three.js 分开加载。

后续登录集成可使用稳定用户 ID 作为角色 seed，再提取可复用角色组件接入房间。目前输入框仅为演示用途，不代表账户注册或登录。
