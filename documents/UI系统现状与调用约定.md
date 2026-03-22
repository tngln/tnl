# UI 系统现状与调用约定

本文只回答两件事：

1. 现在这套 Canvas UI 已经稳定成什么形态。
2. 新代码默认应该怎么写。

完整背景请优先看 [canvas-interface.md](./canvas-interface.md)。

## 当前稳定下来的主干

当前推荐的 UI 分层已经基本固定为：

1. `CanvasUI`
2. `UIElement`
3. `Surface` / `ViewportElement`
4. `ModalWindow` / `SurfaceWindow` / `WindowManager`
5. 声明式 UI / JSX / 函数式 surface

对应的实现现在主要位于：

- `packages/canvas-interface/src/ui`
- `packages/canvas-interface/src/viewport`
- `packages/canvas-interface/src/window`
- `packages/canvas-interface/src/window_manager`
- `packages/canvas-interface/src/builder`
- `packages/canvas-interface/src/jsx`

## 默认写法

### 普通窗口

默认使用：

- `SurfaceWindow`
- `surfaceMount(...)`
- `defineSurface(...)`

不再优先使用：

- 在窗口类里手工 `drawBody()`
- 只为了一个普通面板去写类式窗口子类

### 普通页面 / 面板

默认使用：

- JSX
- 声明式组件
- `PanelColumn`
- `PanelHeader`
- `PanelActionRow`
- `PanelScroll`
- `PanelSection`

这类页面通常是：

- 表单
- 列表
- 说明页
- Developer panel
- 普通工具窗口 body

### 复杂编辑器区域

如果场景满足以下任一条件，直接写类式 `Surface` 或组合多个 `ViewportElement`：

- 多个 viewport 协调
- 独立滚动 / 缩放坐标系
- 自定义 hit test
- 明显以绘图为主，而不是普通控件排版

## 声明式 UI 约定

### JSX 不是 React

当前 JSX runtime 只支持：

- 函数组件
- `Fragment`
- 字符串 / 数字 child 自动转文本节点
- `b` / `i` / `u` / `span` 仅在 `RichText` 内可用

### `defineSurface` 生命周期

`defineSurface({ setup })` 的语义仍然是：

- `setup(...)` 在 mount 时执行一次
- 返回的 `render(props)` 在后续重绘中接收最新 props

因此：

- 局部 `signal`、缓存对象、局部集合，放在 `setup`
- 可能变化的 props，优先从 `render(props)` 读取

### 布局与样式

声明式 UI 当前消费的是 `@tnl/canvas-interface/layout` 提供的布局语义。

最常用属性仍然是：

- `axis`
- `gap`
- `padding`
- `margin`
- `align`
- `justify`
- `fixed`
- `fill`
- `grow`
- `shrink`

## Surface / Viewport 约定

`Surface` 负责：

- 在本地坐标系绘制
- 可选提供 `contentSize`
- 可选处理输入和 hit test

`ViewportElement` 负责：

- `rect`
- `clip`
- `padding`
- `scroll`
- 坐标转换
- pointer / wheel 路由

普通窗口 body 已经内建 viewport host，不要重复为普通 body 再套一层假的 body viewport。

## 平台边界约定

浏览器通用能力优先从 `@tnl/canvas-interface/platform/web` 进入。

如果能力明确属于视频编辑 / 媒体 runtime，则从 `@tnl/app/platform` 进入。

不应再在普通 UI 文件里到处直接读取：

- `window`
- `document`
- `navigator`

## 一句决策规则

如果页面更像“应用面板”，用 `defineSurface + JSX`。

如果页面更像“编辑器控件”，用类式 `Surface + ViewportElement`。
