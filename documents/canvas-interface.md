# Canvas Interface

`packages/canvas-interface` 是应用的框架层，负责：

- UI runtime
- draw / layout / theme / reactivity
- builder / jsx / widgets / text
- browser 侧通用能力
- Developer 窗口与基础面板

它不负责视频编辑业务；这部分属于 `packages/tnl-app`。

## 当前心智模型

- 通用 runtime：`reactivity`、`event_stream`、`fsm`、`commands`、`shortcuts`
- UI runtime：`ui`
- 声明式 authoring：`builder`、`jsx`
- 平台能力：`platform/web`
- 调试与开发者工具：`developer`、`diagnostics`

目录上的内部拆分不等于 public API。稳定入口以 [canvas-interface-public-api.md](./canvas-interface-public-api.md) 为准。

## 推荐使用方式

- 普通窗口 / 面板：优先 `defineSurface(...)`、`surfaceMount(...)`、`SurfaceWindow`
- 复杂编辑器区域：继续使用类式 `Surface` / `ViewportElement`
- 浏览器通用能力：统一从 `@tnl/canvas-interface/platform/web` 获取
- app 业务能力：留在 `@tnl/app/*`，不要回流到 framework

## 边界规则

- 如果一个能力未来多数 canvas 应用都需要，它应属于 `canvas-interface`
- 如果它只服务于视频、编解码、回放、渲染 runtime，它应属于 `tnl-app`
- 不再为内部整理保留历史 bridge 或额外 subpath
