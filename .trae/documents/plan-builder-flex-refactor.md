## 目标

做一次“厘清概念”的大重构，解决目前 Row/Column/RowItem/Row(控件) 的语义混淆问题，把系统收敛到更接近 flexbox 的抽象：

- 容器统一抽象为 **Flex Container**（main/cross axis + gap/align/justify + 未来可扩展 wrap）
- 列表条目统一抽象为 **List Entry / ListRow**（交互控件），不再与布局容器同名
- 迁移期保持可编译、可运行、可渐进迁移；提供开发期 guardrail 把误用变成明确错误

## 现状问题（需要被消除）

- Builder 层有 `Row/Column`（布局容器）与 `RowItem`（列表行挂载节点），Widgets 层有 `Row`（列表行控件）；同名或近似命名导致“看起来合理的嵌套却产生空白”。
- Builder 的容器 axis 目前由 kind 强制覆盖：`axis = node.kind`，这与“flex 只需要 axis 属性”方向相悖，也导致 TSX 里大量 `style={{ axis: ... }}` 实际无效/冗余。
- `rowItem` 在 Builder 中不是普通可组合节点（它会挂载一个独立 widget），其 layout/measure 约束不明显，易误用。

## 重构总策略（分阶段，兼容优先）

### Phase 0：对外 API 先定型（不改语义）

1. **引入新命名体系（新的首选 API）**
   - Builder JSX：
     - `Flex`：通用 flex 容器（推荐）
     - `HStack/VStack`：`axis=row/column` 的语法糖（推荐）
     - `ListRow`：列表行（推荐）
   - Widgets：
     - `ListRow`（或 `ListEntryRow`）：原 `Row` 控件的重命名（推荐）
2. **保留旧 API 作为 alias（迁移窗口）**
   - Builder：`Row/Column/RowItem` 保留，但在 dev guard 下对高风险组合抛错（已做的 guardrail 可继续沿用/增强）。
   - Widgets：`Row` 保留为 `ListRow` 的 re-export，或反向 alias（视最终命名决定）。

验收：项目可编译、现有 UI/测试不受影响；新 API 在至少一个面板中落地示范。

### Phase 1：Builder 容器从“Row/Column kind”收敛到 “Flex kind + axis 属性”

目标：容器只有一个语义：Flex；Row/Column 变成语法糖或兼容层，不再是 layout 节点种类。

具体改造：
1. **BuilderNode kind 收敛**
   - 新增 `kind: "flex"`（替代 `row/column`），其 `style.axis` 决定主轴（row/column）。
   - 现有 `kind: "row"`、`kind: "column"` 暂时保留，但在 `toAst` 入口处映射为 `flex`（或 registry handler 复用），避免一次性修改所有调用点。
2. **移除 registry 对 axis 的强制覆盖**
   - 目前：`containerStyle` 里把 `axis = node.kind` 写死。
   - 未来：`axis` 只来自 `style.axis`（Row/Column 语法糖设置 axis；Flex 要求显式 axis 或默认 row）。
3. **统一容器创建 API**
   - `nodes.ts`/`components.tsx`：
     - `flex(children, style)` / `<Flex style={{ axis: "row" | "column", ... }}>`
     - `HStack/VStack` 只是 preset axis。
     - `Row/Column` 在迁移期继续存在，但内部调用 `Flex/HStack/VStack`。

验收：`Row/Column` 的“只是 axis 特例”在实现层成立；TSX 中 `style.axis` 不再被覆盖。

### Phase 2：列表行控件彻底去“Row”命名冲突（Widgets & Builder runtime）

目标：从命名层面根除“Row 究竟是容器还是条目”的歧义。

具体改造：
1. **Widgets：`Row` → `ListRow`（推荐名）**
   - 新文件：`src/ui/widgets/list_row.ts`（或重命名 `row.ts`）
   - 对外导出：`export { ListRow }`，并在迁移期保留 `export { ListRow as Row }`（或反过来）。
2. **Builder：`rowItem` → `listRow`**
   - Node kind 改为 `listRow`（迁移期可保留 `rowItem` alias），对应 JSX 组件 `ListRow`。
   - `BuilderRuntime.mountRow`/registry handler/类型定义随之调整。
3. **删掉（或降级）旧名**
   - 当全仓迁移完成后，逐步移除 `RowItem`、`rowItemNode`、`Row`（widgets）旧导出；或至少将其限制为内部使用。

验收：不再存在 Builder 容器 `Row` 与 widgets 行控件 `Row` 的同名导入/认知冲突；IDE 搜索 “Row” 不会同时命中两种语义。

### Phase 3：开发期 Guardrails + 文档/示例固化

1. **Guardrails 升级**
   - 由“Row contains RowItem 抛错”升级为“Flex/HStack/VStack 不允许直接包含 listRow 节点”或提供明确用法提示（列表应在 column/vstack 里）。
   - gate 方式：沿用 `__TNL_DEBUG_LEVEL__`（debug/trace）或引入单独的 `__TNL_BUILDER_GUARDS__`（如果希望不依赖日志级别）。
2. **示例与迁移指南**
   - 在 Developer 面板或 `jsx_demo_surface` 中提供推荐用法示例：`<VStack> + <ListRow>`，`<HStack>` 用于工具条。
   - 给出迁移规则清单（Row→HStack、Column→VStack、RowItem→ListRow 等）。

验收：新同事/未来自己按示例写，不会再踩“统计有数据但列表空白”类坑。

## 文件级实施清单（执行阶段会按此修改）

1. Builder 节点与组件
   - `src/ui/builder/types.ts`：新增/替换 `flex`、`listRow` 的 node 类型；保留旧类型 alias
   - `src/ui/builder/nodes.ts`：新增 `flexNode/listRowNode`，保留旧 API 转发
   - `src/ui/builder/components.tsx`：新增 `<Flex>/<HStack>/<VStack>/<ListRow>`，并把旧 `<Row>/<Column>/<RowItem>` 降级为 alias
   - `src/ui/builder/registry.ts`：容器 handler 改为 `flex`；移除 axis 强制覆盖；新增/迁移 listRow handler
   - `src/ui/builder/engine.ts`：在 `toAst` 里做旧 node → 新 node 映射；更新 guardrail 文案与触发条件
2. Widgets 与 BuilderRuntime
   - `src/ui/widgets/row.ts`：迁移为 `ListRow`（重命名或新文件）
   - `src/ui/widgets/index.ts`：导出新名并保留旧名 alias（迁移期）
   - `src/ui/builder/runtime.ts`：`mountRow` 改为 `mountListRow`（或内部仍叫 mountRow，但对外节点种类为 listRow）
3. 调用点迁移（TSX/非 TSX）
   - 逐文件替换：Row→HStack、Column→VStack、RowItem→ListRow（优先 Developer 面板与示例 surface）
   - 清理冗余的 `style.axis`（迁移后 axis 不再被覆盖，保留仅在 Flex/HStack/VStack 语义明确时）
4. 测试与回归
   - 更新/新增 builder 测试：
     - 旧 API 仍可用（alias 测试）
     - 新 API 的 axis 生效（不再被 kind 覆盖）
     - guardrail 在 debug/trace 下正确触发
   - `bun run check` + `bun test`

## 风险与控制

- 这是“大重构”但可做成渐进式：先引入新 API + 兼容层，再逐步替换调用点，最后才移除旧名。
- 关键风险是“导出名冲突/循环依赖/批量替换遗漏”；控制方式是：
  - 每个阶段都保持全量测试通过
  - 先从 Developer 面板/示例 surface 迁移，确认模式正确，再扩大到其它窗口

## 验收标准

- Builder 容器语义统一为 Flex（axis 来自 style），Row/Column 仅作为语法糖或兼容别名
- 列表条目控件命名统一为 ListRow，不再与布局容器同名
- 开发期误用会抛出明确错误（或至少在 debug/trace 下抛出）
- 全量 typecheck/tests 通过

