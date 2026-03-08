## 现状更新
- 本文是最初的 Surface / Viewport 设计稿。
- 当前实现已经在其基础上继续演进：
  - `Surface` 已支持 `contentSize`、`hitTest`、`onWheel`、`compose`
  - `ViewportElement` 已承担 clip / padding / scroll / pointer / wheel 路由
  - `ModalWindow` 已内建 body host，不再要求子类手工 `translate + render`
- 后续继续使用时，请优先参考：`UI系统现状与调用约定.md`

## 背景与目标
- 当前 UI 结构以 `UIElement` 直接挂在 Root 下进行绘制与命中测试，窗口内的内容也多以“绝对坐标 + 手工布局”推进。
- 引入 **Surface/Viewport** 的目的是把“内容（可布局/可交互/可复用）”与“承载与约束（尺寸/裁切/滚动/事件投递）”解耦，使后续：
  - 窗口内容区域、面板、列表、编辑器、时间线等都能统一承载。
  - 滚动、clip、输入坐标变换、可选的滚动条系统可以在 Viewport 层集中实现。

## 核心概念
### Surface（内容载体）
- Surface 是“实际承载内容/控件/排版”的单位。
- Surface 只关心在自己的 **本地坐标系**（surface-local）下绘制与处理事件。
- Surface 具备：
  - `measure`：根据约束（constraints）给出自己想要的尺寸（可选，用于布局系统）。
  - `render`：在给定 Viewport 的约束、偏移、裁切策略下绘制。
  - `hitTest`：根据局部坐标判断命中哪个子元素/控件（可选：复用现有 `UIElement` 模型）。
  - `event`：处理 pointer/keyboard 等事件（可选）。

### Viewport（约束与投递）
- Viewport 是“把 Surface 显示出来”的窗口/面板/区域。
- Viewport 负责：
  - 选择 target：当 Viewport 绑定了一个 Surface 才开始渲染。
  - 传递约束：尺寸、padding、是否 clip、滚动偏移等。
  - 坐标变换：屏幕坐标 ↔ viewport-local ↔ surface-local。
  - 裁切（clip）：将 Surface 的渲染裁切在 Viewport 区域内（可配置）。
  - 事件投递：将 pointer 事件转换为 surface-local 并投递给 Surface。
  - 可选滚动条系统：在 Viewport 层绘制与交互。

## 设计边界（职责划分）
- Surface：内容组织、绘制内容、内容命中、内容内部状态。
- Viewport：尺寸约束、clip、滚动偏移、事件路由（含 capture/hover 管理可延用 CanvasUI 或下沉到 Viewport）。
- Window（ModalWindow）：负责窗口壳（标题栏、拖拽、缩放、最小化等），其 body 区域内部使用一个或多个 Viewport。

## 建议的数据结构（初稿）
### 坐标/约束类型
- `Size = { w: number; h: number }`
- `Rect = { x: number; y: number; w: number; h: number }`
- `Constraints = { minW: number; minH: number; maxW: number; maxH: number }`
- `ViewportOptions = { clip?: boolean; scroll?: { x: number; y: number }; padding?: number }`

### Surface 接口（可选最小集合）
- `interface Surface {`
  - `id: string`
  - `measure?(ctx, constraints): Size`（可选：当 Surface 需要参与布局时使用）
  - `render(ctx, viewport: ViewportContext): void`
  - `hitTest?(pLocal, viewport: ViewportContext): any | null`
  - `onPointerDown?(eLocal, viewport): void` / `onPointerMove` / `onPointerUp`
  - `onKeyDown?(e): void`
  - `}`
- `ViewportContext` 包含：
  - `rect: Rect`（viewport 在屏幕/父坐标中的位置与大小）
  - `contentRect: Rect`（扣除 padding 后的内容区域）
  - `clip: boolean`
  - `scroll: { x: number; y: number }`
  - `toSurface(pViewportLocal): pSurfaceLocal`

### Viewport 作为 UIElement 的一种
- 方案 A（推荐）：`ViewportElement extends UIElement`
  - `bounds(): Rect` 由外部布局/窗口 body 决定
  - `target: Surface | null`
  - `options: ViewportOptions`
  - `onDraw(ctx)`：
    - 计算 `ViewportContext`
    - 若 `clip`：`ctx.save(); ctx.beginPath(); ctx.rect(...); ctx.clip();`
    - `ctx.translate(contentRect.x - scroll.x, contentRect.y - scroll.y)`（将 surface 原点对齐到 contentRect）
    - 调用 `surface.render(ctx, viewportCtx)`
    - `ctx.restore()`
    - （可选）绘制滚动条 overlay
  - `hitTest(p, ctx)`：
    - 先命中自身 rect
    - 若命中且有 target：将点转换为 surface-local，询问 surface.hitTest；若有命中则返回 ViewportElement 或一个代理对象（见“事件路由”）
- 方案 B：Viewport 不作为 UIElement，而是由 Window body 手动调用 render/hitTest（更轻，但会分散事件逻辑）

## 事件路由与 capture 策略
- 目标：与现有 `CanvasUI` 的 capture/hover 模型兼容。
- 建议：
  - ViewportElement 在 `onPointerDown` 内部将事件转换为 surface-local，并直接调用 `surface.onPointerDown`。
  - capture 仍发生在 `CanvasUI`（通过 `e.capture()`），但 capture 的对象是 ViewportElement；ViewportElement 内部维护“当前 active surface target”即可。
  - 如果未来要命中到 Surface 内的具体控件（Button/Checkbox 等），可以让 Surface 内继续使用 `UIElement` 树，并在 ViewportElement 的 `hitTest` 中把命中结果“封装/代理”为一个可接收事件的 UIElement（或 Surface 返回一个 handler）。

## 裁切（clip）与滚动（scroll）
- 最小实现：
  - clip：默认开启；允许在 options 关闭。
  - scroll：仅提供 `scroll.x/y` 偏移，不含滚动条；支持鼠标滚轮后续再加。
- 未来扩展：
  - “内容尺寸”概念：Surface 可选提供 `contentSize`，Viewport 依据 `contentSize` 计算滚动范围并绘制滚动条。
  - 滚动条控件建议作为 Viewport 的 children（仍是 UIElement）绘制在 overlay 层。

## 与现有系统的集成步骤（建议执行顺序）
1. 新增 `src/ui/viewport.ts`：实现 `ViewportElement` 与 `ViewportContext`，先支持 clip + scroll 偏移 + target surface render。
2. 新增一个最简单的 `Surface` 实现（例如 `ControlsSurface`）：
   - 内部复用现有 `UIElement` 控件树（Button/Checkbox/Radio 等）并将其坐标视为 surface-local。
3. 在 `DeveloperWindow` 中创建一个 Viewport（占满 body），target 到 `ControlsSurface`，把现有控件示例从 DeveloperWindow 迁移到 Surface。
4. 验证：缩放窗口时 viewport 尺寸变化、内容被裁切、交互事件正确传递。
5. 可选：为 AboutWindow 也换成一个只读 Surface（验证文本排版在 clip 下表现稳定）。

## 风险与约束
- Canvas 的 clip/translate 需要严格成对 `save/restore`，防止污染其它窗口绘制。
- 命中测试与坐标变换要统一：建议把“point to surface-local”的函数放进 ViewportContext。
- 短期内不要引入过度复杂的“layout 参与 measure”系统：先把 Viewport 的大小由窗口/布局直接给定，Surface 仅在内部排版即可。
