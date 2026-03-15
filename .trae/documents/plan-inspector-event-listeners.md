## 现状更新
- 本文档是 Inspector 事件监听器展示的初始计划。
- **当前状态：⚠️ 部分实现**
- `DebugTreeNodeSnapshot` 已扩展 `listeners` 字段
- `UIElement.debugListeners()` 已提供默认推断
- `TitleBarButton` / `ResizeHandle` / `InteractiveElement` 已实现 `debugListeners()` 覆写
- `Developer.Inspector` 面板已展示 listeners 信息

## 目标（部分完成）
让 Developer.Inspector 能够在选中某个具体 UI Element 时，展示它会响应哪些交互事件（例如 click、drag、wheel、key 等），并把这份信息作为运行时树（Inspector Tree）的可观测字段输出。

## 现状复盘（"注册性"在哪里）
- 目前 UI 事件系统是"方法覆写驱动"，而非 DOM 式 `addEventListener` 注册表：
  - 命中：`UIElement.hitTest()` 递归命中目标。
  - 投递：`dispatchPointerEvent` 沿 `eventParentTarget()` 冒泡调用 `onPointerDown/Move/Up...`（以及 wheel/key 等）。
  - "注册"本质上就是：某个 element 的原型链上是否实现了这些 handler 方法，以及业务组件（Button/ResizeHandle/TitleBarButton 等）是否在这些 handler 中触发了更高层语义（click/drag）。
- Inspector Tree 来自 `root.debugSnapshot()`，其节点结构是 `DebugTreeNodeSnapshot`，目前不包含任何"事件能力/监听器"字段；只有 `kind/type/label/id/bounds/z/visible/meta/children`。

结论：要让 Inspector "看到事件监听器"，最符合当前架构的做法不是引入全局事件注册表，而是把"element 的交互能力描述"纳入 debug snapshot（可被 Inspector 面板展示）。这既贴合当前的注册模型（方法覆写），也能允许少量组件用更精确的语义覆盖默认推断。

## 设计方案（两层：默认推断 + 可覆盖）

### A) 数据模型：为 DebugTreeNodeSnapshot 增加可选字段
- 在 `DebugTreeNodeSnapshot` 上新增可选字段 `listeners?: DebugEventListenerSnapshot[]`。
- 新增类型 `DebugEventListenerSnapshot`（建议字段）：
  - `id: string`（例如 `"click"`, `"pointer.down"`, `"drag.resize"`, `"wheel"`）
  - `label: string`（用户可读，例如 `"Click"` / `"Drag (resize)"`）
  - `detail?: string`（可选：额外说明，如 `"capture"`、`"title-bar drag"` 等）

约束：
- 字段为 **可选**，避免破坏现有 snapshot 消费方；Inspector 面板只在存在时展示。

### B) 默认推断：基于 handler 方法存在性产出"事件能力"
在 `UIElement` 体系里增加一个可被覆写的 debug 扩展点（优先使用"显式声明"，否则 fallback 到默认推断）：

- 在 `UIElement`（或 `UIEventTargetNode`）上新增方法：
  - `protected debugListeners?(): DebugEventListenerSnapshot[] | null`
- `UIElement.debugSnapshot()` 生成节点时，如果 `debugListeners()` 返回数组则写入 `listeners`；
  - 否则执行默认推断：检查实例上是否存在对应 handler 方法，生成基础 listeners：
    - pointer：`onPointerDown/Move/Up/Cancel`
    - hover：`onPointerEnter/Leave`
    - wheel：`onWheel`
    - key：`onKeyDown/Up`
    - focus：`canFocus/onFocus/onBlur`（可选）

默认推断保证"普适覆盖"，即便不能把 click/drag 语义精确区分，也能先回答"这个 element 会接收哪些底层事件"。

### C) 语义覆盖：为关键组件提供更高层的 listener 声明
对用户关心的语义（click/drag）做精准暴露，靠覆写 `debugListeners()`：

- `TitleBarButton`：声明 `{ id:"click", label:"Click" }`
- `ResizeHandle`：声明 `{ id:"drag.resize", label:"Drag (resize)" }`
- `InteractiveElement`（Button 的基类）：声明 `{ id:"click", label:"Click" }`（以及可选：press/hover）
- 未来扩展：Scrollbar、Docking 拖拽 handle、Divider handle 等，都可在对应 element 类里覆写，输出 `{ id:"drag.scroll" }`、`{ id:"drag.split" }` 等。

这层覆盖的价值是：把"业务语义"显式注册到 debug snapshot，而不是依赖脆弱的静态推断。

## Inspector 面板展示（UI 变更）
- 在 `Developer.Inspector` 的 Selection 区块中新增 "Listeners" 展示：
  - 若 `selected.listeners` 非空：
    - 使用 `ListRow` 或 `Text` 列出（每项显示 label，detail 可作为右侧 meta）。
  - 若为空：显示 `No listeners`（muted）。
- 保持原有 "Selection label / describeNode" 文案不变，仅增补新的信息分组。

## 需要修改/新增的文件（部分完成）
1) 事件/调试数据模型与快照生成
- 修改 `src/ui/base/ui.ts`
  - 扩展 `DebugTreeNodeSnapshot` 类型：增加 `listeners?: DebugEventListenerSnapshot[]`
  - 增加 `DebugEventListenerSnapshot` 类型定义
  - 在 `UIElement.debugSnapshot()` 里填充 `listeners`（通过 `debugListeners()` 或默认推断）

2) 关键组件的语义 listeners 覆写
- 修改 `src/ui/window/window.ts`
  - `TitleBarButton` / `ResizeHandle` 增加 `debugListeners()` 覆写
- 修改 `src/ui/widgets/interactive.ts`
  - `InteractiveElement` 增加 `debugListeners()` 覆写（click/press/hover）

3) Inspector 面板 UI 展示
- 修改 `src/ui/window/developer/panels/inspector_panel.tsx`
  - Selection 区块新增 listeners 展示

## 测试与回归（部分完成）
- 新增或扩展测试（二选一或都做）：
  1) `ui.debug` 相关测试：断言 debugSnapshot 节点包含 listeners 字段（至少对某个已知 element，如 TitleBarButton/ResizeHandle）。
  2) `window_manager` / `window` 相关测试：创建窗口，调用 `root.debugSnapshot()`，确保能找到 TitleBarButton/ResizeHandle 节点并验证 listeners。
- 全量回归：
  - `bun run check` ✅
  - `bun test` ✅

## 验收标准
- 打开 Developer.Inspector，选中 TitleBarButton，能看到 "Listeners: Click"。
- 选中 ResizeHandle，能看到 "Listeners: Drag (resize)"。
- 对普通 element，至少能展示底层事件能力（pointer/wheel/key）或显示 No listeners（根据默认推断结果）。
- 全量类型检查与测试通过。
