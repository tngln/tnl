# Canvas Interface

本文档描述当前 `packages/canvas-interface` 的真实定位，而不是迁移过程中的中间态。

配套文档：

- [UI系统现状与调用约定.md](./UI系统现状与调用约定.md)
- [layout-flex.md](./layout-flex.md)
- [Surface-Viewport 设计.md](./Surface-Viewport%20设计.md)
- [canvas-interface-public-api.md](./canvas-interface-public-api.md)

## 定位

`canvas-interface` 是整个应用的基础框架层。它负责：

- 通用 UI runtime
- draw / layout / theme / reactivity
- builder / jsx / widgets / surfaces
- browser 侧通用能力
- Developer 窗口与基础面板

它不负责视频编辑业务本身；这部分属于 `packages/tnl-app`。

## 当前目录心智模型

### 通用 runtime

- `packages/canvas-interface/src/reactivity`
- `packages/canvas-interface/src/event_stream`
- `packages/canvas-interface/src/fsm`
- `packages/canvas-interface/src/commands`
- `packages/canvas-interface/src/shortcuts`

### 绘制与布局

- `packages/canvas-interface/src/draw`
- `packages/canvas-interface/src/layout`
- `packages/canvas-interface/src/theme`

### UI runtime

- `packages/canvas-interface/src/ui`
- `packages/canvas-interface/src/ui_base`
- `packages/canvas-interface/src/viewport`
- `packages/canvas-interface/src/window`
- `packages/canvas-interface/src/window_manager`
- `packages/canvas-interface/src/compositor`
- `packages/canvas-interface/src/top_layer`
- `packages/canvas-interface/src/drag_drop`

### 高层 authoring

- `packages/canvas-interface/src/builder`
- `packages/canvas-interface/src/jsx`
- `packages/canvas-interface/src/widgets`
- `packages/canvas-interface/src/surfaces`

### 平台与调试

- `packages/canvas-interface/src/browser`
- `packages/canvas-interface/src/platform/web`
- `packages/canvas-interface/src/developer`
- `packages/canvas-interface/src/diagnostics`

## 推荐使用方式

### 普通窗口或面板

优先使用：

- `SurfaceWindow`
- `defineSurface(...)`
- JSX / Builder 组件

也就是说，默认心智模型仍然是：

1. 用 `defineSurface` 定义内容
2. 用 `surfaceMount(...)` 挂进窗口
3. 用 `WindowManager` 管理窗口生命周期

### 复杂编辑器区域

如果场景具有这些特点：

- 多 viewport
- 自定义 hit test
- 拖拽/缩放/滚动状态机复杂
- 需要直接画标尺、时间轴、网格、预览层

则继续使用类式 `Surface` / `UIElement` / `ViewportElement` 的组合。

### 浏览器能力

浏览器通用能力从 `@tnl/canvas-interface/browser` 进入，例如：

- canvas / layer canvas
- RAF / animation helpers
- clipboard
- dialogs
- file I/O
- navigator/runtime flags
- text input bridge
- OPFS

如果能力明确是视频编辑/媒体 runtime 专用，则应留在 `@tnl/app/platform`。

## Developer 约定

Developer 窗口归 `canvas-interface` 所有，默认基础面板包括：

- Data
- Storage
- Control
- WM
- Surface
- Inspector

app 侧通过显式 panel 数组追加扩展页，例如：

- Worker
- Codec

当前支持的组合方式是：

```ts
const panels = [...defaultDeveloperPanels(), ...tnlAppDeveloperPanels()]
```

## 公开 API 约定

`canvas-interface` 可以保留清晰的 package subpath 入口，例如：

- `@tnl/canvas-interface/ui`
- `@tnl/canvas-interface/builder`
- `@tnl/canvas-interface/browser`
- `@tnl/canvas-interface/developer`
- `@tnl/canvas-interface/docking`

但不再鼓励重新引入随意增长的内部 bridge 或旧路径兼容层。

更具体的入口分级约定，见 [canvas-interface-public-api.md](./canvas-interface-public-api.md)。

## 当前仍值得继续做的事

- 继续收紧公共导出面
- 继续抽象通用交互 helper
- 继续减少对全局 `invalidateAll()` 的依赖

## Demo

仓库现在包含一个最小 demo：

- `packages/canvas-interface/demo/index.html`
- `packages/canvas-interface/demo/main.tsx`

它展示的是 framework 自身的最小组合：

- `CanvasUI`
- `WindowManager`
- `SurfaceWindow`
- Builder surface
- Developer 基础面板

## 与 `tnl-app` 的分工

`canvas-interface` 负责“框架能力”，`tnl-app` 负责“视频编辑能力”。

一个简单判断规则是：

- 如果未来从这里 fork 一个别的 canvas 应用，大概率也需要它，那它应属于 `canvas-interface`
- 如果它只服务于视频、编解码、回放、渲染 runtime，那它应属于 `tnl-app`
