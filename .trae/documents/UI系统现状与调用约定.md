# UI 系统现状与调用约定

本文档记录当前已经落地的 Canvas UI 基建。它不是初始设计稿，而是面向“回忆当前实现”和“后续继续开发时如何接着写”的现状说明。

相关旧文档：
- `Surface-Viewport 设计.md`：记录最初的 Surface/Viewport 设计意图。
- `开发者工具框架.md`：记录 Developer 窗口最初的框架计划。
- `layout-flex.md`、`文本排版增强.md`：记录 layout 与富文本的早期设计。

---

## 1. 当前 UI 架构分层

当前系统已经形成 6 层：

1. `CanvasUI`
- 文件：`src/ui/base/ui.ts`
- 职责：
  - 管理高 DPI canvas。
  - 管理 dirty rect 和局部重绘。
  - 管理 pointer / wheel 事件分发、capture、hover。
  - 管理 `Compositor` 帧生命周期。
- 当前特性：
  - `wheel` 已进入统一事件系统。
  - 在 canvas 上全局拦截 `Ctrl + wheel` / `Meta + wheel`，避免触发浏览器页面缩放。

2. `UIElement`
- 文件：`src/ui/base/ui.ts`
- 这是最底层的可命中、可绘制节点系统。
- 仍然适合：
  - 自定义命中逻辑
  - 自定义绘制
  - 需要直接控制 pointer 状态机的低层组件

3. `Surface` / `ViewportElement`
- 文件：`src/ui/base/viewport.ts`
- `Surface` 负责内容坐标系下的绘制和事件处理。
- `ViewportElement` 负责：
  - clip
  - padding
  - scroll
  - 坐标转换
  - 将 pointer / wheel 转成 surface-local 再投递给 `Surface`
- 当前 `Surface` 接口已经支持：
  - `render`
  - `contentSize`
  - `hitTest`
  - `onPointerDown/Move/Up`
  - `onWheel`
  - `compose`

4. 窗口系统
- 文件：`src/ui/window/window.ts`
- 核心是 `ModalWindow`。
- 现在已经从“子类自己手工画 body”演进为“窗口内建 body host”：
  - `setBodySurface(surface, opts?)`
  - 内建 `bodyViewport`
  - body rect 统一由窗口壳计算
- `SurfaceWindow` 是当前推荐的窗口 authoring 入口：
  - 窗口壳仍由类管理
  - body 则直接挂 `Surface` 或函数式 surface mount spec

5. Builder / JSX / 函数式 Surface
- 入口文件：
  - `src/ui/builder/surface_builder.ts`
  - `src/ui/builder/components.tsx`
  - `src/ui/jsx.ts`
- 当前高层 UI 的推荐写法已经不是“继承类 + 手算坐标”，而是：
  - JSX 产出 `BuilderNode`
  - `defineSurface(setup)` 建立实例状态
  - `mountSurface(...)` 或 `surfaceMount(...)` 产出真实 `Surface`

6. 页面级样式继承
- 仍在 Builder 层内部完成，不是浏览器 CSS。
- 关键字段：
  - `provideStyle`
  - `styleOverride`
- 目标：
  - 让文本颜色、字重、字号、surface tone 等视觉语义沿 Builder 树有限继承
  - 不让 flex/layout 尺寸也参与继承

---

## 2. 当前推荐的 authoring 范式

### 2.1 高层页面 / 面板

默认使用：
- JSX
- `defineSurface`
- `SurfaceWindow`

推荐形态：

```tsx
const ExampleSurface = defineSurface({
  id: "Example.Surface",
  setup: () => {
    const count = signal(0)

    return () => (
      <PanelColumn>
        <Text weight="bold">Example</Text>
        <Button text={`Count ${count.peek()}`} onClick={() => count.set((v) => v + 1)} />
      </PanelColumn>
    )
  },
})
```

适用对象：
- About body
- Developer panels
- 控制面板
- 数据面板
- 说明型或表单型窗口内容

### 2.2 复杂复合组件

仍然保留类式 `Surface`。

适用对象：
- `TimelineCompositeSurface`
- `TabPanelSurface`
- 多 viewport 复合控件
- 需要专门的滚动/缩放/命中协调层的组件

判断标准：
- 如果只是页面结构和局部状态，优先函数式 surface。
- 如果需要专门绘图管线、专门 hit test、多子 viewport 协调，继续用类式 surface。

---

## 3. Builder 系统当前能力

### 3.1 BuilderNode

当前 Builder 节点主要包括：
- 容器：
  - `row`
  - `column`
  - `stack`
- 基础：
  - `text`
  - `richText`
  - `button`
  - `checkbox`
  - `radio`
  - `rowItem`
  - `scrollArea`
  - `spacer`

### 3.2 JSX runtime

文件：`src/ui/jsx.ts`

当前规则：
- 字符串 / 数字 child 自动转 `text` 节点
- `null` / `undefined` / `false` 被忽略
- children 自动拍平
- 只支持函数组件
- `Fragment` 只是返回 children，不引入额外层级

### 3.3 函数式 Surface

文件：`src/ui/builder/surface_builder.ts`

关键 API：
- `defineSurface({ id, setup })`
- `mountSurface(definition, props)`
- `surfaceMount(definition, props)`

语义：
- `setup(props)` 每个实例只执行一次
- `render(props)` 每次重绘执行
- props 更新不会重跑 setup
- setup 内允许使用 `signal()`、`Set`、`Map`、缓存对象

---

## 4. 样式继承系统现状

当前已经不是纯 `variant` 路线，而是有限级联继承。

### 4.1 继承的数据

当前 `InheritedStyle` 只覆盖视觉语义：

- `text`
  - `color`
  - `fontFamily`
  - `fontSize`
  - `fontWeight`
  - `lineHeight`
  - `emphasis`
- `surface`
  - `tone`
  - `density`
  - `panelFill`
  - `panelStroke`
  - `sectionFill`
  - `sectionStroke`
  - `scrollFill`

### 4.2 不继承的数据

以下内容仍然必须显式写：
- `w/h`
- `grow/shrink/basis/fill/fixed`
- `padding/gap/margin`
- `align/justify`
- `active/visible`
- 具体 widget 尺寸

这是刻意的。否则布局会变得不可预测。

### 4.3 使用规则

- 父节点通过 `provideStyle` 给子树提供默认视觉样式。
- 节点通过 `styleOverride` 覆盖自身最终样式。
- `styleOverride` 不会自动向后代扩散。

当前页面级组件已经把这套继承包装好了，因此一般不需要直接手写这两个字段。

---

## 5. 当前可直接复用的 Builder 页面组件

文件：`src/ui/builder/components.tsx`

### 5.1 通用结构组件
- `Column`
- `Row`
- `Stack`
- `Spacer`
- `ScrollArea`
- `Section`
- `FormRow`
- `ToolbarRow`

### 5.2 文本与控件组件
- `Text`
- `RichText`
- `Button`
- `Checkbox`
- `Radio`
- `RowItem`

### 5.3 页面骨架组件
- `PanelColumn`
- `PanelToolbar`
- `PanelHeader`
- `PanelActionRow`
- `PanelScroll`
- `PanelSection`

### 5.4 当前这些组件已承担的默认语义

`PanelColumn`
- 页面主容器
- 提供默认 body text 样式

`PanelHeader`
- 标题 + 右侧 meta / trailing

`PanelActionRow`
- 开发者工具/工具面板顶部动作条
- 支持：
  - `actions`
  - `compact`
  - `icon`
  - `title`
  - `disabled`

`PanelScroll`
- 面板主滚动区

`PanelSection`
- 面板内带边框/背景的小节

---

## 6. 基础控件当前状态

### 6.1 Button

文件：`src/ui/widgets/button.ts`

当前支持：
- `active`
- `disabled`
- `title`

当前语义：
- `active = false`：不参与显示/命中
- `disabled = true`：可见但不可点击
- `title`：当前用于 compact/icon 工具栏按钮的 tooltip 提示

### 6.2 Checkbox / Radio

文件：
- `src/ui/widgets/checkbox.ts`
- `src/ui/widgets/radio.ts`

当前支持：
- 真正的 `disabled` 态
- 可见但不可交互
- hover/down/click 不再响应

### 6.3 Row

文件：`src/ui/widgets/row.ts`

当前是公共列表行组件，而不是某个面板私有实现。

当前能力：
- `group` / `item` 两种变体
- `selected`
- `hover`
- `click`
- 左右文本自动截断，避免覆盖

已用于：
- Data panel
- Storage panel

### 6.4 Scrollbar

文件：`src/ui/widgets/scrollbar.ts`

当前支持：
- 横向 / 纵向
- auto hide
- 作为通用滚动条被复用于：
  - `TabPanelSurface`
  - `TimelineCompositeSurface`
  - Builder `scrollArea`

---

## 7. Surface / Viewport 当前使用方式

### 7.1 ViewportElement 已承担的职责

- clip
- padding
- scroll 偏移
- surface-local 坐标转换
- pointer / wheel 路由

### 7.2 wheel 的当前约定

`CanvasUI` 已统一发出 `WheelUIEvent`。

当前行为：
- 如果组件显式 `handle()`，上层会 `preventDefault()`
- canvas 内全局拦截 `Ctrl + wheel` / `Meta + wheel`
- `ViewportElement` 会先把 wheel 转成 local 坐标，再交给 `Surface.onWheel`

### 7.3 body host 的窗口化收口

现在窗口 body 不应该再手写：
- `ctx.save()`
- `ctx.translate(...)`
- `surface.render(ctx, fakeViewport)`
- `ctx.restore()`

新写法应当使用：
- `SurfaceWindow`
- `setBodySurface(...)`

---

## 8. 开发者工具当前状态

入口：
- `src/ui/window/developer/developer_tools_window.ts`
- `src/ui/window/developer/index.ts`

### 8.1 当前 Tab 列表

Developer 页面当前保留：
- Data
- Storage
- Control
- WM
- Worker
- Codec
- Surface
- Inspector

已经移除：
- Timeline Developer Tab

原因：
- Timeline 已经演进为独立工具窗口和独立核心组件，不再适合作为 Developer 下的一个占位 tab。

### 8.2 当前各 panel 的形态

`Control`
- 函数式 surface
- JSX
- `PanelSection` + 表单/控件示例

`Data`
- 函数式 surface
- 当前是真实数据面板，不再只是说明文字
- 使用 `RowItem` 构建 state tree 列表

`Storage`
- 函数式 surface
- 已不再使用面板内部 hard-coded list widget
- 当前结构：
  - `PanelHeader`
  - `PanelActionRow`
  - `PanelScroll`
  - `RowItem`
- 仍保留真实 OPFS 行为：
  - refresh
  - upload
  - download
  - delete
  - edit meta
  - prefix

`WM / Worker / Codec / Surface / Inspector`
- 目前主要通过共享 `InfoPanel` 骨架展示状态与后续方向
- 已迁到 Builder / JSX / Panel 组件体系

---

## 9. Timeline 当前状态

Timeline 已经是独立核心 UI 组件，不再放在 Developer tab 里。

核心文件：
- `src/ui/surfaces/timeline_surface.ts`
- `src/ui/timeline/model.ts`
- `src/ui/window/timeline_tool_window.ts`

当前结构：
- `TimelineCompositeSurface`
  - `TimelineRulerSurface`
  - `TimelineContainerBackgroundSurface`
  - `TimelineTrackHeaderSurface`
  - `TimelineTrackContentSurface`
- 两个 scrollbar
- 横纵滚动
- `Ctrl` / `Meta` + wheel 缩放
- fixed header 与滚动内容分离

当前定位：
- 属于复杂 composite surface
- 继续保留类式实现
- 不应强行迁到 Builder 整棵树

---

## 10. 当前窗口层推荐写法

### 10.1 About / Tool / Developer 这类窗口

优先使用：
- `SurfaceWindow`
- body 挂函数式 surface

例如：

```ts
export class AboutDialog extends SurfaceWindow {
  constructor() {
    super({
      id: "Help.About",
      x: 80,
      y: 80,
      w: 480,
      h: 260,
      title: "About",
      open: true,
      resizable: true,
      body: surfaceMount(AboutBodySurface, {}),
    })
  }
}
```

### 10.2 什么时候继续直接继承 `ModalWindow`

只有在窗口壳本身需要特殊行为时才直接继承 `ModalWindow`。

普通窗口内容不要再自己维护：
- body rect
- 自己 new 的 body viewport
- 手工 translate 渲染逻辑

---

## 11. 当前继续开发时的默认约定

### 11.1 默认优先级

新写一个普通面板 / 对话框 body 时，优先顺序应是：

1. `SurfaceWindow`
2. `defineSurface`
3. JSX + Builder components
4. `PanelColumn / PanelHeader / PanelActionRow / PanelScroll / PanelSection`

### 11.2 不要优先做的事情

以下做法现在都应视为例外，而不是默认：
- 在窗口 `drawBody()` 里手工排版
- 面板里重新手写一套列表 widget
- 仅为了保存局部状态去 `extends BuilderSurface`
- 在每一行 JSX 上重复手写 theme token

### 11.3 什么时候仍然应该回到底层

满足以下任一条件时，直接写类式 `Surface` / `UIElement` 是合理的：
- 需要复杂命中测试
- 需要多个 viewport 协调
- 需要独立滚动/缩放坐标系
- 需要专门的绘图管线和裁剪策略

---

## 12. 后续文档更新建议

后续如果继续推进 UI 基建，优先在本文补：
- 新的页面级组件约定
- 新的函数式 surface 能力
- 窗口层 authoring 变化
- Developer 面板结构变化

而旧设计文档主要保留：
- 设计初衷
- 边界讨论
- 为什么当时这样选

这样文档职责会更清楚：
- 旧文档解释“为什么”
- 本文解释“现在是什么、接下来怎么用”
