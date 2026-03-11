## 目标
引入一个类似 Web Popover/TopLayer 的“顶层浮层系统”，用于解决 UIElement/Surface 之间的 Z Index 叠放与命中问题；并把 Dropdown 的弹出菜单迁移到 TopLayer 上，保证：
- 永远绘制在最前（跨控件/跨 surface 的遮挡问题消失）
- 命中/鼠标交互稳定（hover/点击选择可用）
- 支持“点击外部关闭”（light dismiss），且不阻断外部点击继续落到下层控件

## 现状与问题原因（简述）
- 当前 Dropdown 菜单是 Dropdown widget 内部自绘，靠扩大 bounds() 试图覆盖弹出区域。
- 但绘制顺序与 hitTest 优先级由 UIElement.z + children 顺序决定；跨控件/跨 surface 时，菜单会被后绘制/更高 z 的元素盖住，且点击可能优先命中下层元素。
- 现有 Root overlay（DragImageOverlay/SnapPreviewOverlay）能置顶，但它们不吃输入（containsPoint=false），也缺少“点击外部关闭并继续下发事件”的机制。

## 设计原则
- TopLayer 是“渲染层级与事件预处理机制”的组合：
  1) 渲染：TopLayer 的内容以极高 z 挂在 CanvasUI.root 上，确保绘制在最前
  2) 事件：在 CanvasUI 命中测试前做一次 top-layer 的外部点击判断（light dismiss），关闭后继续正常 hitTest，从而实现“关闭 + 仍能点击下面”
- TopLayer 不依赖 DOM；沿用现有 Canvas UI 树与 Compositor（可选）能力。
- API 要能被 widget 调用（如 Dropdown），且不引入全局单例耦合。

## 对外 API（建议）
新增 `TopLayerController`（绑定到每个 CanvasUI 实例）：
- `open(id: string, el: UIElement): void`
- `close(id: string): void`
- `closeAll(): void`
- `isOpen(id: string): boolean`
- `hitTest(p: Vec2): UIElement | null`（可选，用于将来做 modal/backdrop）
- `containsPoint(p: Vec2): boolean`（判断 p 是否落在任一 top-layer 元素内）
- `onBeforePointerDown(p: Vec2): void`（用于 light dismiss；关闭后不拦截后续事件）

## 实现步骤
### 1) 新增 TopLayerController 与 TopLayerHost（root 置顶渲染）
1. 新建文件：`src/ui/base/top_layer.ts`
2. 实现 `TopLayerController`：
   - 内部持有一个 `TopLayerHost extends UIElement`
   - 用 `Map<string, UIElement>` 管理 entries；open 时将 entry 加入 host.children，并设置极高 z（例如 8_000_000 以上）
   - close 时从 host.children 移除
   - `containsPoint(p)`：遍历 entries，判断 `pointInRect(p, entry.bounds())`（或调用 entry.hitTest(p) != null）
3. TopLayerHost：
   - `bounds()` 返回全画布 rect（来自 CanvasUI 的尺寸）；用于渲染裁剪与 invalidate，但不用于命中（命中由 controller 预处理）
   - `containsPoint()` 返回 false（避免它成为事件目标而阻断下层控件）
   - `onDraw()` 为空；由 children 各自 draw

### 2) 将 TopLayerController 注入 CanvasUI 运行时（让 widget 可调用）
1. 修改 `src/ui/base/ui.ts`：
   - CanvasUI 构造时创建 `this.topLayer = new TopLayerController(...)`
   - 在 `root.draw(ctx, rt)` 注入 `topLayer` 到 rt：`{ ..., topLayer: this.topLayer }`
   - 增强 rt 类型：在 UIElement.draw 的 rt 参数类型中增加 `topLayer?: TopLayerController`
2. 在 CanvasUI 每帧渲染/尺寸变化时，更新 topLayerHost 的画布 bounds（用于正确的 invalidate/clip）
3. 事件预处理（关键）：在 CanvasUI 的 `onPointerDown` 分发前：
   - 调用 `this.topLayer.onBeforePointerDown({x,y})`
   - 逻辑：若存在 open entry 且点击点不在任何 entry 内，则 closeAll()
   - 之后继续执行正常 hitTest + dispatch，从而实现 light dismiss 且不吞点击

### 3) 实现一个可复用的 TopLayerMenu（Dropdown 的弹出面板）
1. 新建文件：`src/ui/widgets/dropdown_menu.ts`
2. `DropdownMenu extends UIElement`：
   - props：`rect: () => Rect`（菜单区域）、`options`、`selected`、`onSelect(value)`、`onDismiss()`
   - 交互：hover 高亮、点击选择、点击外部由 topLayer 的 pre-dispatch 关闭触发 onDismiss（Dropdown 负责同步 open 状态）
   - 绘制：复用 Dropdown 现有菜单绘制风格（背景、hover、选中态）
3. 命中：bounds() 为菜单 rect；containsPoint 只在菜单 rect 内返回 true

### 4) 迁移 Dropdown：主控件仍在原位置，菜单交给 TopLayer
1. 修改 `src/ui/widgets/dropdown.ts`：
   - Dropdown 本体只负责绘制“关闭态控件”；不再在自身 draw 内绘制菜单
   - 点击主框：
     - 若打开：调用 `rt.topLayer.close(menuId)` 并设置 open=false
     - 若关闭：创建/更新一个 DropdownMenu entry（菜单 rect 位于主框下方），调用 `rt.topLayer.open(menuId, menuEl)`，并设置 open=true
   - `menuId` 使用 BuilderRuntime 的 key（在 mountDropdown 时传入），保证同一个实例稳定复用
   - `onBlur()`：关闭菜单（close menuId）
2. 修改 `src/ui/builder/runtime.ts`：
   - mountDropdown 创建 Dropdown 时传入 `id: key`（或在 update 时更新 id）

### 5) 兼容性与回归验证
1. 运行：
   - `bun run check`
   - `bun test`
2. 扩展/新增单测：
   - `dropdown.test.ts`：验证打开后点击选项能改变 selected（菜单现在是 top-layer entry，测试可直接 new DropdownMenu 或模拟 controller）
   -（可选）新增 `top_layer.test.ts`：验证 `onBeforePointerDown` 关闭逻辑不影响后续命中（以 controller 纯逻辑为主）
3. 手动验收（Developer.Control）：
   - Dropdown 菜单永远在最上层（覆盖其它控件）
   - hover/点击选择正常
   - 点击菜单外：菜单关闭且下面的控件正常响应（例如点击 Button 仍能触发）

## 交付验收标准
- Dropdown 弹层在任何布局/控件叠放情况下都不会被盖住，并且鼠标交互稳定。
- 点击外部会关闭 dropdown，并且外部点击仍能落到下层控件（不吞事件）。
- 代码结构允许后续复用 TopLayer 来实现 ContextMenu、Tooltip、Popover 等。

