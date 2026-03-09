# UI 系统现状与调用约定

本文只回答两件事：

1. 现在这套 Canvas UI 已经收敛到什么形态。
2. 继续写代码时，默认应该怎么写。

完整说明请优先看 [canvas-interface.md](./canvas-interface.md)。

## 1. 当前已经稳定下来的分层

当前 UI 的主干已经基本固定为：

1. `CanvasUI`
   - 管 canvas、dirty rect、pointer / wheel、capture、hover、`Compositor`。
2. `UIElement`
   - 最底层命中与绘制节点。
3. `Surface` / `ViewportElement`
   - 内容对象与视口壳分离。
4. `ModalWindow` / `SurfaceWindow` / `WindowManager`
   - 窗口壳、窗口 body host、窗口编排。
5. Builder / JSX / 函数式 surface
   - 普通页面和面板的默认 authoring 方式。

这条链路已经被这些真实实现验证过：

- `src/ui/window/about_dialog.tsx`
- `src/ui/window/developer/panels/*.tsx`
- `src/ui/surfaces/tab_panel_surface.ts`
- `src/ui/surfaces/timeline_surface.ts`
- `src/ui/docking/workspace_surface.ts`

## 2. 当前默认写法

### 2.1 普通窗口

默认使用：

- `SurfaceWindow`
- `surfaceMount(...)`
- `defineSurface(...)`

不要再优先写：

- 继承窗口类后在 `drawBody()` 里手工排版
- 手工维护一个 fake viewport 给 body 用

### 2.2 普通页面 / 面板

默认使用：

- JSX
- Builder components
- `PanelColumn`
- `PanelHeader`
- `PanelActionRow`
- `PanelScroll`
- `PanelSection`

这类页面的典型特征是：

- 列表
- 表单
- 说明型内容
- Developer panel
- 工具窗口 body

### 2.3 复杂编辑器区域

满足以下任一条件时，直接写类式 `Surface`：

- 多个 viewport 协调
- 独立滚动 / 缩放坐标系
- 自定义 hit test
- 明显以绘图为主，而不是以普通控件排版为主

当前代表：

- `TimelineCompositeSurface`
- `TabPanelSurface`
- `DockWorkspaceSurface`

## 3. Builder 侧当前约定

### 3.1 JSX 不是 React

当前 JSX runtime 只支持：

- 函数组件
- `Fragment`
- 字符串 / 数字 child 自动转文本节点
- `b` / `i` / `u` / `span` 仅在 `RichText` 内可用

### 3.2 `defineSurface` 生命周期

`defineSurface({ setup })` 的语义是：

- `setup(initialProps)` 每次 mount 只执行一次
- 返回的 `render(props)` 在后续重绘里接收最新 props

因此：

- 局部 `signal`、缓存对象、局部集合，放在 `setup`
- 如果 props 以后会变，渲染时优先读 `render(props)` 参数，而不是只闭包捕获初始 props

### 3.3 布局与样式

当前 Builder 会消费 `src/core/layout.ts` 的 `LayoutStyle`。

最常用的属性：

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

当前样式继承只覆盖视觉语义，不覆盖布局尺寸。也就是说：

- 文本颜色、字号、字重可以继承
- `w/h`、`grow`、`padding`、`margin` 仍要显式写

## 4. Surface / Viewport 当前约定

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

当前普通窗口 body 已经内建 viewport host。不要为普通窗口内容重复 new 一个 body viewport。

## 5. 平台边界约定

浏览器运行时能力优先从 `src/platform/web` 进入。

当前不应再默认在这些层里直接读取浏览器全局：

- `core`
- `ui/base`
- `ui/window`
- Developer panels

换句话说，UI 写法可以继续是 web-first，但浏览器绑定点应尽量集中。

## 6. 当前不要优先做的事情

- 在窗口类里回到手工 body 排版
- 在普通面板里重写一套列表 / 滚动 / section 结构
- 仅为了保存几个局部状态而退回类式 surface
- 在 Builder 页面里到处重复手写 token，而不复用 `Panel*` 组件
- 在新 UI 文件里重新散开 `window` / `document` / `navigator`

## 7. 一句决策规则

如果页面更像“应用面板”，用 `defineSurface + JSX`。

如果页面更像“编辑器控件”，用类式 `Surface + ViewportElement`。
