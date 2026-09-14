# 手绘角色独立演示

访问 `/hand-drawn-character/index.html`。直接访问仍是独立形象演示；主入口 `/` 通过 `?mode=guest` 嵌入本页作为游客入口，输入名字后点击「游客进入」。父页面保存名字、角色截图和本地游客 ID，随后进入房间。

原始作者：byteab（Ehsan sarshar）。

来源：https://gist.github.com/byteab/06d251617c670840f4889d3a032a0e7e

原始文件：`hand-drawn-character-creator.html`。保留原有角色生成和动画逻辑，仅将 Three.js 的 import map 从 CDN 改为同目录的本地模块，避免运行时依赖该 CDN。字体使用本机可用字体，页面无需请求外部字体服务。

`three.module.js` 为 Three.js 0.160.0，来源 https://unpkg.com/three@0.160.0/build/three.module.js ，MIT 许可证见 `THREE-LICENSE.txt`。它与房间使用的 npm 版 Three.js 分开加载。

角色 seed 使用确认时的名字，头像来自该角色场景的 192×192 截图。同源 iframe 消息只接受父子页面间通信。游客存档由父页面负责，独立演示地址不会写入存档。
