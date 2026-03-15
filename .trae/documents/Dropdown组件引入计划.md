## 现状更新
- 本文档是 Dropdown 组件的初始计划。
- **当前状态：✅ 已实现**
- `src/ui/widgets/dropdown.ts` 已实现：
  - `Dropdown` 类（继承 InteractiveElement）
  - 打开/关闭菜单交互
  - 选项选择
  - TopLayer 集成
- `src/ui/widgets/dropdown_menu.ts` 已实现菜单 UI
- `src/ui/builder/components.tsx` 已导出 `Dropdown` JSX 组件
- `src/ui/surfaces/controls_surface.tsx` 已包含 Dropdown 示例

## 目标（已完成）
在现有 Canvas UI / builder 体系中引入 `Dropdown` 组件，使用户能在一组固定选项中选择一项；并在 `Developer.Control` 面板（ControlsSurface）里新增一个示例实例。

## 设计约束与假设
- 复用现有 widget/BuilderRuntime 的挂载模型（Button/Radio/Checkbox 的模式），避免引入 DOM 原生 `<select>`。
- 交互以鼠标/触控选择为主；键盘导航可留作后续增强（本次至少保证可打开、可选择、可关闭）。
- "几个确定的选项"预期数量不大（例如 3–10 个），初版不做滚动菜单；如超出上限则菜单高度截断（可后续补 scroll）。

## 对外 API（在 builder/components 层）
- 新增组件：`<Dropdown selected={Signal<string>} options={[{ value, label }]} disabled? />`
- 约定：
  - `selected`：当前选中值；组件内部在选择时直接 `selected.set(value)`，与 `Radio` 一致。
  - `options`：固定候选列表；`label` 用于显示，`value` 为存储值。
  - `disabled`：禁用交互。

## 实施步骤（已完成）
### 1) 新增 Dropdown widget（Canvas 绘制 + 交互）
- 新建文件：`src/ui/widgets/dropdown.ts` ✅
- 行为：
  - 关闭态：绘制一个类似 TextBox/Button 的框，显示当前 label + 下拉箭头。
  - 点击（pointer up over control）：
    - 如果关闭：打开菜单，并 `requestFocus(this)`。
    - 如果打开：根据指针位置选择对应 option（点击在菜单区域内），更新 `selected` 并关闭。
  - 失焦（onBlur）：关闭菜单（支持点击外部自动关闭）。
  - bounds()/containsPoint：
    - 关闭时命中主框 rect；
    - 打开时命中主框 rect + 菜单 rect（用于接收菜单点击）。
  - onPointerMove：在打开时维护 `hoveredIndex`，绘制高亮。
- 绘制：
  - 使用 theme 字体颜色/边框色；菜单绘制背景、分隔线、hover 背景。
  - 菜单位置：主框下方；必要时在 y 方向做简单夹取（避免完全出界，先按 viewport 不可知的情况下只做 rect 本地绘制）。

### 2) 连接到 BuilderRuntime（生命周期复用）
- 修改：
  - `src/ui/widgets/index.ts`：导出 `Dropdown` ✅
  - `src/ui/builder/runtime.ts`：
    - 增加 `DropdownCell`、`private readonly dropdowns = new Map<string, DropdownCell>()`
    - beginFrame/endFrame 复用现有 markAllUnused/deactivateUnusedWidgetCells
    - 新增 `mountDropdown(key, rect, node, active)`，创建并更新 Dropdown widget
    - debugCounts 增加 dropdowns

### 3) 扩展 builder 类型与 registry
- 修改：
  - `src/ui/builder/types.ts`：新增 `DropdownNode`，并把它加入 `BuilderNode` union
  - `src/ui/builder/nodes.ts`：新增 `dropdownNode(options, selected, opts)`
  - `src/ui/builder/registry.ts`：
    - 新增 handler：`kind: "dropdown"`，measure 返回固定高度（例如 28）与最小宽度（例如 160 或 fill）
    - mount 调用 `engine.runtime.mountDropdown(...)`
    - 在 `createDefaultBuilderRegistry()` 注册 dropdownHandler
  - `src/ui/builder/components.tsx`：新增 `export function Dropdown(...)`，把 JSX props 映射到 dropdownNode

### 4) 在 Developer.Control 面板提供示例
- 修改：`src/ui/surfaces/controls_surface.tsx` ✅
  - 新增 `const dropdown = signal("A")`（或已有 radio 信号复用也可，但建议独立）
  - 在 `PanelSection title="Controls"` 内新增一个 `FormRow label="Dropdown"`：
    - `field={<Dropdown selected={dropdown} options={[...]} />}`
  - 在 status 文本中追加 Dropdown 当前值。

### 5) 测试与验证
- 新增单测：`src/ui/widgets/dropdown.test.ts`
  - 覆盖：disabled 不改变；打开后点击菜单项会改变 selected；blur 会关闭（若可通过调用 onBlur 验证状态）。
- 运行：
  - `bun run check` ✅
  - `bun test` ✅

## 交付验收标准
- Developer.Control 面板出现 Dropdown 示例，可展开并选择不同选项，选择后 status 文本更新。
- 点击控件外部会关闭下拉菜单。
- 不影响现有控件行为与测试；类型检查与测试全绿。
