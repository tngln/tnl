## 目标

新增一个可复用的 Menu 组件（用于下拉菜单/上下文菜单等），并与现有 UI 基础设施（TopLayer、ClickArea、RowItem、TreeRow 等）保持一致的交互语义与视觉风格。

## 范围

- 提供 Menu/ MenuItem 的数据结构与渲染组件
- 支持常见交互：打开/关闭、hover 高亮、点击选择、禁用项、分隔线
- 支持定位：相对锚点（anchor rect / point）弹出、自动翻转/贴边（基础版即可）
- 支持 light-dismiss（点击菜单外关闭）、Esc 关闭、可选的右键上下文菜单
- 与现有 Dropdown/DropdownMenu 的能力对齐或替代（评估后决定是否迁移）

非目标（第一版不做）：
- 复杂子菜单（多级 cascade）
- 可搜索/过滤
- 虚拟化超长列表

## 现状调研（只读）

1. 盘点现有“类似菜单”的实现（尤其是 dropdown_menu、top_layer、lightDismiss、viewport/top-layer hitTest 路径）。
2. 找到现有 RowItem/TreeRow 的交互与样式约定（hover、active、disabled、选中态）。
3. 确认菜单的渲染位置：是否应挂在 TopLayer（通常需要）以及 top-layer 的 z/clip 语义。

输出：列出将复用/对齐的现有模块与 API（文件路径、关键函数/类）。

## 设计

### 1) API 设计

- `MenuItem` 类型（建议）：
  - `key: string`
  - `text: string`
  - `title?: string`
  - `disabled?: boolean`
  - `checked?: boolean`（可选）
  - `shortcut?: string`（可选展示）
  - `kind?: "item" | "separator"`（或用 `separator` 单独类型）
  - `onSelect?: () => void`
- `Menu` 组件 props（建议）：
  - `items: MenuItem[]`
  - `open: boolean`
  - `onClose: () => void`
  - `anchorRect?: Rect` 或 `anchorPoint?: Vec2`
  - `placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end"`
  - `minW?/maxW?`（可选）
  - `selectedKey?: string`（可选高亮）
  - `onSelect?: (key: string) => void`（可选，作为 onSelect 的补充）

### 2) 行为语义

- 打开时：
  - 注册到 TopLayer（或 TopLayer host 的子树）以保证不受窗口裁剪，并在最上层接收事件
  - 初始 focus/hover 逻辑：默认不选中，或选中首个可用 item（由现有 UX 约定决定）
- 关闭条件：
  - 点击菜单外（light dismiss）
  - Esc
  - 选择任意 item 后（先回调 onSelect，再关闭）
- hover：
  - pointer move 更新高亮项
- disabled：
  - hover 可高亮（可选）但点击不触发

### 3) 布局与样式

- 使用现有 theme（圆角、描边、背景、行高、padding）
- Item 渲染复用 RowItem（如合适），否则单独实现 MenuRow（保持一致的 layout）
- 宽度：由内容测量或固定 min width（与现有控件一致）
- 贴边/翻转：若菜单超出 viewport，则尝试翻转到上方或向内 clamp

### 4) 与现有 Dropdown/DropdownMenu 的关系

给出两条路径并在实现时选一条：
- A. 抽出公共 Menu 组件，让 DropdownMenu 内部调用 Menu（推荐）
- B. 新建 Menu 组件，先不改 DropdownMenu，后续逐步迁移（低风险）

## 实施步骤（执行阶段）

1. 新增 Menu 相关类型与节点（若走 Builder 组件）：
   - 在 builder/types.ts 增加 menu 节点类型（或仅 UI widget 层实现）
   - 在 builder/nodes.ts 增加 `menuNode` 工厂（如需要）
2. 实现 Menu 渲染与事件：
   - 选择落点：TopLayerController 或专用 MenuHost UIElement
   - 实现 hitTest、cursor、绘制（背景 + items）
   - 实现 light-dismiss 与 Esc 关闭
3. 接入示例：
   - 选择一个现有面板/控件（例如 Developer.Data/Inspector 或 DropdownMenu）做最小演示
4. 添加测试：
   - 单元测试：打开/关闭、点击外部关闭、禁用项不触发、选择触发回调
   - 交互测试（若有现成 harness）：pointer move hover、Esc 关闭
5. 回归：
   - `bun run check`
   - `bun test`

## 验收标准

- 菜单不会被窗口裁剪；叠放窗口时 cursor/事件不穿透（遵守现有 hitTest 与 top-layer 语义）
- 选择项立即触发回调并关闭；点击外部/按 Esc 会关闭
- disabled 项不触发选择
- 测试覆盖关键交互且全量测试通过

