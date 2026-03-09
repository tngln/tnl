# Canvas Interface

本文档是当前 Canvas UI 的主入口文档。它描述的是 `tnl` 现在已经落地、可以继续扩展的接口，而不是最早的设想稿。

配套文档：

- [UI系统现状与调用约定.md](./UI系统现状与调用约定.md)：当前推荐写法与禁忌项。
- [Surface-Viewport 设计.md](./Surface-Viewport%20设计.md)：Surface / Viewport 的设计背景与当前映射。
- [layout-flex.md](./layout-flex.md)：布局属性与排版语义的补充说明。

## 1. 当前能力快照

当前 Canvas UI 已经具备这些基础能力：

- `CanvasUI`
  - 高 DPI canvas 管理。
  - dirty rect 与局部重绘。
  - pointer / wheel 事件归一化。
  - pointer capture、hover 管理。
  - `Compositor` 图层缓存与合成。
- 窗口系统
  - `ModalWindow` / `SurfaceWindow`。
  - `WindowManager` 统一管理注册、焦点、z-order、最小化、最大化、贴边吸附、最小化 tile 布局。
  - 窗口 body 已内建 `ViewportElement` host，不再需要手工 `translate + render`。
- 高层界面 authoring
  - `defineSurface(...)` / `mountSurface(...)` / `surfaceMount(...)`。
  - JSX + BuilderNode 树。
  - 常用页面骨架：`PanelColumn`、`PanelHeader`、`PanelActionRow`、`PanelScroll`、`PanelSection`。
  - 基础控件：`Text`、`RichText`、`Button`、`Checkbox`、`Radio`、`RowItem`、`ScrollArea`。
- 复杂复合 surface
  - `TabPanelSurface`
  - `TimelineCompositeSurface`
  - `DockWorkspaceSurface`
- 平台边界
  - 浏览器相关能力优先从 `src/platform/web` 进入，而不是散落在 UI 文件里直接访问 `window` / `document` / `navigator`。

当前推荐心智模型很简单：

1. 普通窗口或面板：`SurfaceWindow + defineSurface + JSX`。
2. 复杂缩放/滚动/多子视口：类式 `Surface + ViewportElement`。
3. 浏览器能力：`src/platform/web`。

## 2. 分层结构

当前 UI 可以按下面 5 层理解：

### 2.1 `CanvasUI`

文件：`src/ui/base/ui.ts`

职责：

- 驱动整个 canvas 根渲染。
- 做 dirty rect 合并与局部重绘。
- 把原生 `PointerEvent` / `WheelEvent` 变成 `PointerUIEvent` / `WheelUIEvent`。
- 管理全局 capture / hover。
- 在一帧内初始化 `Compositor`。

这是运行时根，不是页面 authoring 层。

### 2.2 `UIElement`

文件：`src/ui/base/ui.ts`

`UIElement` 仍然是最底层的可绘制、可命中节点树。它适合：

- 自定义 hit test。
- 自定义 pointer 状态机。
- 内部子控件很多、但不想走 Builder 树的场景。

`ViewportElement`、窗口按钮、Scrollbar、docking tab handle 都建立在这一层。

### 2.3 `Surface` / `ViewportElement`

文件：`src/ui/base/viewport.ts`

`Surface` 是内容对象，`ViewportElement` 是显示和投递它的壳。

`Surface` 当前接口：

```ts
export type Surface = {
  id: string
  render: (ctx, viewport) => void
  contentSize?: (viewportSize) => Vec2
  blendMode?: GlobalCompositeOperation
  opacity?: number
  compose?: (compositor, viewport) => void
  hitTest?: (pSurface, viewport) => UIElement | null
  onPointerDown?: (e, viewport) => void
  onPointerMove?: (e, viewport) => void
  onPointerUp?: (e, viewport) => void
  onWheel?: (e, viewport) => void
}
```

`ViewportElement` 负责：

- `rect`
- `clip`
- `padding`
- `scroll`
- canvas/global 坐标到 surface-local 的转换
- pointer / wheel 路由

普通窗口 body 已经默认有一个 `ViewportElement`。只有在你要做复合 surface 时，才需要自己再创建额外的 viewport。

### 2.4 窗口层

文件：

- `src/ui/window/window.ts`
- `src/ui/window/window_manager.ts`

当前窗口职责划分：

- `ModalWindow`：窗口壳、标题栏、拖动、缩放、最小化、最大化。
- `SurfaceWindow`：给普通窗口提供标准 body surface 接口。
- `WindowManager`：统一做注册、焦点、z-order、贴边吸附、最小化 tile 布局。

现在普通窗口内容不应再写进 `drawBody()`。body 应当交给 `Surface`。

### 2.5 Builder / JSX / 函数式 Surface

文件：

- `src/ui/jsx.ts`
- `src/ui/builder/surface_builder.ts`
- `src/ui/builder/components.tsx`

这是当前高层 UI 的默认 authoring 方式。

它的作用是：

- 用 JSX 产出 `BuilderNode`。
- 用 Builder engine 把节点树转成布局、绘制和控件挂载。
- 把普通面板写成函数式 `Surface`，而不是一堆手算坐标。

## 3. 从零开始写一个窗口

### 3.1 建立根运行时

最小根结构与 `src/main.ts` 一致：

```ts
const root = new Root()
const windows = new WindowManager(root)
const ui = new CanvasUI(canvas, root, {
  onTopLevelPointerDown(top) {
    if (top instanceof ModalWindow) windows.onWindowPointerDown(top)
    else top.bringToFront()
  },
})

windows.setCanvasSize(ui.sizeCss)
```

这条链路的职责是：

- `Root` 挂所有顶层元素。
- `WindowManager` 管所有窗口。
- `CanvasUI` 真正接管 canvas、事件和重绘。

### 3.2 定义一个函数式 surface

当前最常见的入口是 `defineSurface(...)`：

```tsx
type CounterProps = { title: string }

const CounterSurface = defineSurface<CounterProps>({
  id: (props) => `Demo.Counter.${props.title}`,
  setup: () => {
    const count = signal(0)

    return (props) => (
      <PanelColumn>
        <PanelHeader title={props.title} meta={`${count.peek()} clicks`} />
        <PanelSection title="Actions">
          <Button
            text={`Count ${count.peek()}`}
            style={{ fixed: 140 }}
            onClick={() => count.set((v) => v + 1)}
          />
        </PanelSection>
      </PanelColumn>
    )
  },
})
```

这里要注意两件事：

- `setup(props)` 只在 mount 时执行一次，适合放 `signal`、缓存对象、局部 `Map` / `Set`。
- 返回的 `render(props)` 会在重绘时收到最新 props。如果 props 以后还会变，不要只闭包捕获初始 props。

### 3.3 把 surface 挂进窗口

```ts
function createCounterWindow() {
  return new SurfaceWindow({
    id: "Demo.Counter",
    x: 120,
    y: 120,
    w: 360,
    h: 220,
    minW: 280,
    minH: 180,
    title: "Counter",
    open: true,
    resizable: true,
    body: surfaceMount(CounterSurface, { title: "Counter" }),
  })
}
```

`SurfaceWindow.body` 可以接收：

- 一个现成的 `Surface`
- `surfaceMount(...)` 返回的 mount spec
- 一个返回 `Surface` 的工厂函数

普通窗口默认优先用 `surfaceMount(...)`。

### 3.4 注册窗口

```ts
const counter = createCounterWindow()
windows.register(counter)
```

从这里开始，窗口的焦点、z-order、最小化、最大化、贴边吸附都由 `WindowManager` 管。

## 4. 函数式组件怎么写

### 4.1 JSX 规则

当前 JSX runtime 不是 React，也不是 DOM：

- 只支持函数组件。
- `Fragment` 只是拍平 children。
- 字符串和数字会自动转成 `text` 节点。
- `null` / `undefined` / `false` 会被忽略。
- 原生标签只支持 `b`、`i`、`u`、`span`，而且只能写在 `<RichText>` 里面。

例如：

```tsx
function MetaLine(props: { label: string; value: string }) {
  return (
    <Row style={{ align: "center", gap: 8 }}>
      <Text tone="muted">{props.label}</Text>
      <Spacer style={{ fill: true }} />
      <Text>{props.value}</Text>
    </Row>
  )
}
```

### 4.2 当前常用组件

页面结构：

- `Column`
- `Row`
- `Stack`
- `Spacer`
- `ScrollArea`
- `Section`
- `FormRow`
- `ToolbarRow`

页面骨架：

- `PanelColumn`
- `PanelToolbar`
- `PanelHeader`
- `PanelActionRow`
- `PanelScroll`
- `PanelSection`

控件：

- `Text`
- `RichText`
- `Button`
- `Checkbox`
- `Radio`
- `RowItem`

### 4.3 当前推荐页面骨架

普通工具面板优先从这套骨架开始：

```tsx
<PanelColumn>
  <PanelHeader title="Storage" meta="12 entries" />
  <PanelActionRow compact actions={[...]} />
  <PanelScroll>
    <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
      {rows}
    </Column>
  </PanelScroll>
</PanelColumn>
```

对应现成例子：

- `src/ui/window/about_dialog.tsx`
- `src/ui/window/developer/panels/wm_panel.tsx`
- `src/ui/window/developer/panels/storage_panel.tsx`

### 4.4 redraw 语义

Builder surface 本身不是响应式 effect。当前约定是：

- pointer / wheel 交互后，`CanvasUI` 会自动对顶层区域做 invalidation。
- 如果状态变化来自异步任务、计时器、worker 或其它非交互路径，仍然要有人调用 `ui.invalidate()` 或 `ui.invalidateRect(...)`。

也就是说：`signal` 负责持有状态，不直接等于“自动重绘”。

## 5. Surface 和 Viewport 到底是什么

### 5.1 Surface

`Surface` 是内容本体：

- 在自己的本地坐标系里绘制。
- 可选提供虚拟内容尺寸 `contentSize(...)`。
- 可选接管 hit test 和输入。
- 可选用 `compose(...)` 直接走 `Compositor`。

一个 `Surface` 可以很轻：

```ts
class DemoSurface implements Surface {
  id = "Demo.Surface"

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    draw(
      ctx as CanvasRenderingContext2D,
      Rect(
        { x: 0, y: 0, w: viewport.contentRect.w, h: viewport.contentRect.h },
        { fill: { color: "rgba(255,255,255,0.02)" } },
      ),
    )
  }
}
```

这里通常从 `(0, 0)` 开始画。`ViewportElement` 在调用 `render(...)` 前已经做了 translate。

### 5.2 ViewportElement

`ViewportElement` 是 Surface 的宿主：

- 决定它显示在什么 `rect`。
- 是否 clip。
- 是否带 padding。
- 当前 scroll 偏移是多少。
- 如何把 pointer / wheel 转成 surface-local 坐标。

对于普通窗口内容，你不需要手工 new 一个 body viewport。`ModalWindow` 已经内建了这个 host。

### 5.3 什么时候手工创建 Viewport

只有在你做复合 surface 时才需要，例如：

- `TabPanelSurface`
  - 固定 tab bar
  - body 内部再套一个 viewport 和可选 scrollbar
- `TimelineCompositeSurface`
  - ruler viewport
  - header viewport
  - content viewport
  - 背景 viewport
- `DockWorkspaceSurface`
  - 每个叶子 pane 有自己的 content viewport

换句话说：

- 普通面板：window body 的 viewport 已经够用。
- 复杂编辑器控件：自己再组多个 viewport。

### 5.4 `SurfaceRoot` 的用途

`SurfaceRoot` 是一个无边界的大根节点，适合拿来在 surface 内部挂子 `UIElement`：

- 内部按钮
- scrollbars
- split handle
- tab handle
- 其它子 viewport

常见写法：

```ts
class CompositeSurface implements Surface {
  readonly id = "Composite"
  private readonly root = new SurfaceRoot()

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    // 先画背景
    // 再让内部 UIElement 树绘制
    this.root.draw(ctx as CanvasRenderingContext2D)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }
}
```

## 6. 怎样排版

布局能力定义在 `src/core/layout.ts`，当前主要由 Builder engine 消费。

### 6.1 关键属性

- 主轴与容器
  - `axis: "row" | "column" | "stack"`
  - `justify`
  - `align`
  - `alignSelf`
- 间距
  - `gap`
  - `rowGap`
  - `columnGap`
  - `padding`
  - `inset`
  - `margin`
- 尺寸
  - `w`
  - `h`
  - `minW`
  - `minH`
  - `maxW`
  - `maxH`
  - `fixed`
  - `fill`
- 弹性
  - `grow`
  - `shrink`
  - `basis`
- 定位语义
  - `position: "flow" | "overlay"`
  - `overflow: "visible" | "clip" | "scroll"`

### 6.2 当前最常用的几条规则

普通页面里，优先依赖下面这些组合，而不是自己算坐标：

- 整页容器：`<PanelColumn>`
- 顶部工具条：`<PanelHeader>` 或 `<PanelToolbar>`
- 内容滚动区：`<PanelScroll>`
- 分节：`<PanelSection>`
- 填充剩余空间：`<Spacer style={{ fill: true }} />`
- 固定宽度按钮或标签：`style={{ fixed: 120 }}`

### 6.3 典型例子

左右对齐一行：

```tsx
<Row style={{ align: "center", gap: 8 }}>
  <Text tone="muted">Label</Text>
  <Spacer style={{ fill: true }} />
  <Text>Value</Text>
</Row>
```

表单行：

```tsx
<FormRow
  label="Actions"
  labelWidth={64}
  field={<Button text="Run" style={{ fixed: 120 }} onClick={run} />}
/>
```

滚动列表：

```tsx
<PanelScroll>
  <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
    {items.map((item) => (
      <RowItem key={item.id} leftText={item.label} rightText={item.meta} />
    ))}
  </Column>
</PanelScroll>
```

### 6.4 当前不要误解的地方

- `overflow` 是布局语义，不会自动给你生成滚动条。
- Builder 场景里要滚动，优先用 `ScrollArea` / `PanelScroll`。
- 更底层的复合场景，滚动通常由 `ViewportElement + Scrollbar` 组合完成。

## 7. 什么时候直接用绘图上下文

默认情况下，高层面板不应该直接拿 `CanvasRenderingContext2D` 画 UI。优先顺序应当是：

1. `defineSurface`
2. JSX + Builder components
3. 只有不适合 Builder 时，才直接实现 `Surface.render(...)`

### 7.1 适合直接画的场景

- 时间轴、标尺、波形、网格、缩略图等高度定制画面。
- 多 viewport 协调。
- 独立滚动 / 缩放坐标系。
- 自定义 hit test、拖拽、吸附。
- 需要 `Compositor`、混合模式或离屏图层缓存。

### 7.2 当前建议

在 `render(ctx, viewport)` 里：

- 优先使用 `draw(...)`、`Rect(...)`、`RRect(...)`、`Line(...)`、`Text(...)` 这些 helper。
- 把 `(0, 0)` 当成 surface 内容原点。
- 用 `viewport.contentRect.w / h` 表示当前可见区域大小。
- 只有 helper 不够时，才直接下沉到原始 canvas API。

例如：

```ts
render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
  const width = viewport.contentRect.w
  const height = viewport.contentRect.h

  draw(
    ctx as CanvasRenderingContext2D,
    Rect({ x: 0, y: 0, w: width, h: height }, { fill: { color: "#0f1521" } }),
    Line({ x: 0, y: 32.5 }, { x: width, y: 32.5 }, { color: "rgba(255,255,255,0.08)", hairline: true }),
  )
}
```

### 7.3 输入坐标

通过 `ViewportElement` 进入 `Surface` 的事件，坐标已经是 surface-local：

- `Surface.onPointerDown/Move/Up`
- `Surface.onWheel`
- `Surface.hitTest`

所以在这些回调里，不需要再手工减掉 viewport 的 `x/y`。

### 7.4 滚动内容

如果你的内容可以比 viewport 更大，应实现：

```ts
contentSize(viewportSize) {
  return { x: viewportSize.x, y: 1200 }
}
```

然后再由外层 viewport 或 scrollbar 去决定 scroll 范围。

### 7.5 图层合成

大部分 surface 不需要自己碰 `Compositor`。只有在你需要：

- 离屏缓存静态层
- 特殊 blend mode
- 自定义合成流程

时，才实现 `compose(...)` 或设置 `blendMode` / `opacity`。

## 8. 当前推荐决策

如果你现在要继续写 UI，默认按下面选：

- 普通对话框、设置页、信息面板
  - `SurfaceWindow + surfaceMount(SomeSurface, props)`
- Developer panel、工具面板
  - `defineSurface + JSX + Panel*`
- 滚动列表、表单、说明页
  - Builder 组件 + `PanelScroll`
- 复杂编辑器区域
  - 类式 `Surface`
- 多子视口、缩放、标尺、docking
  - `SurfaceRoot + ViewportElement + UIElement`

当前不推荐再回到这些旧写法：

- 在窗口 `drawBody()` 里直接排版整个页面
- 在普通面板里手工维护 fake viewport
- 只为局部状态去写一整个类式 surface
- 在 UI 层直接读取浏览器全局对象

## 9. 可直接参考的源码

最适合当样板的文件：

- `src/main.ts`
- `src/ui/window/about_dialog.tsx`
- `src/ui/window/developer/panels/wm_panel.tsx`
- `src/ui/window/developer/panels/storage_panel.tsx`
- `src/ui/surfaces/tab_panel_surface.ts`
- `src/ui/surfaces/timeline_surface.ts`
- `src/ui/docking/workspace_surface.ts`

如果要判断“该用函数式 surface 还是类式 composite surface”，最简单的经验规则是：

- 页面像一个表单、列表或信息面板：函数式 surface。
- 页面像一个编辑器、工作区或自定义绘图控件：类式 composite surface。
