# Surface / Viewport 设计

本文保留 Surface / Viewport 的设计背景，但不再作为主入口文档。当前可直接开发的说明，请优先看 [canvas-interface.md](./canvas-interface.md)。

## 1. 最初想解决什么问题

引入 Surface / Viewport 的核心原因一直没变：

- 把“内容本体”与“显示区域”拆开。
- 把滚动、clip、坐标转换、事件投递集中到一层处理。
- 让窗口 body、tab 内容、timeline、workspace pane 都能复用同一套承载方式。

这套思路现在已经落在：

- `src/ui/base/viewport.ts`
- `src/ui/window/window.ts`
- `src/ui/surfaces/tab_panel_surface.ts`
- `src/ui/surfaces/timeline_surface.ts`
- `src/ui/docking/workspace_surface.ts`

## 2. 当前真实映射

### 2.1 `Surface`

现在的 `Surface` 已经是一个稳定接口，主要负责：

- 在 surface-local 坐标系中绘制
- 可选提供 `contentSize(viewportSize)`
- 可选处理 `hitTest`
- 可选处理 pointer / wheel
- 可选接入 `Compositor`

当前 `Surface` 不承担通用页面布局职责。普通页面布局主要已经由 Builder + `core/layout.ts` 负责。

### 2.2 `ViewportElement`

`ViewportElement` 当前负责：

- `rect`
- `clip`
- `padding`
- `scroll`
- `toSurface(...)`
- pointer / wheel 的 local 坐标转换与投递

在今天的代码里，`ViewportElement` 已经不只是概念草图，而是实际被大量复用的宿主节点。

### 2.3 窗口 body host

最关键的变化是：窗口 body 现在已经标准化。

`ModalWindow` 内建了 body viewport，`SurfaceWindow` 则把这个能力变成普通窗口的默认入口。

因此：

- 普通窗口内容不再要求子类自己 `ctx.translate(...)`
- 普通窗口也不再需要自己维护一个“伪 viewport”

## 3. 当前职责边界

推荐这样理解三层职责：

- `Surface`
  - 内容绘制
  - 内容 hit test
  - 内容级输入处理
- `ViewportElement`
  - 约束、clip、scroll、坐标变换、事件路由
- `ModalWindow`
  - 窗口壳、标题栏、拖拽、缩放、最小化、最大化

这个边界现在已经比最初草稿更清晰，也更适合继续扩展。

## 4. 和最初设计稿相比，已经发生的变化

### 4.1 普通页面不再以 Surface 自己做布局为主

最初设想里，Surface 会承担更多内部布局工作。现在实际走通的路线是：

- 普通页面：Builder + `core/layout.ts`
- 复杂画布控件：类式 `Surface`

这比“所有内容都走同一种 surface 布局协议”更实用。

### 4.2 capture / hover 仍然沿用 `UIElement` 体系

当前 Viewport 内部输入路由没有单独发明一套 capture 系统，而是继续复用：

- `PointerUIEvent.capture()`
- `UIElement.hitTest(...)`
- `UIElement.onPointer*`

这让 viewport 内部 child widgets、scrollbar、tab handle 能和整个 UI 树保持一致。

### 4.3 Viewport 不是给每个普通页面手工 new 的

现在已经明确：

- 普通窗口 body：使用窗口自带 viewport host
- 复杂复合 surface：按需要自己组多个 viewport

这也是当前实现里最重要的调用约定之一。

## 5. 什么时候应该自己组 Viewport

只有在这些场景里，才应该显式写 `new ViewportElement(...)`：

- 一个 surface 内需要多个独立滚动区域
- 需要固定 header + 可滚动内容
- 需要 ruler / content / sidebar 分离
- 需要把不同 pane surface 动态挂接到不同区域

当前代表：

- `TabPanelSurface`
- `TimelineCompositeSurface`
- `DockWorkspaceSurface`

## 6. 当前可直接采用的结论

- Surface 是内容对象，不是窗口壳。
- Viewport 是 Surface 的宿主，不是页面 authoring 的默认入口。
- 普通面板优先走 `SurfaceWindow + defineSurface + JSX`。
- 复杂编辑器区域才回到底层 `Surface + ViewportElement + UIElement` 组合。
