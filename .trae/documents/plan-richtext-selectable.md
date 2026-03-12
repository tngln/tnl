## 目标

为 `RichText` 增加 `selectable` 属性，使 Canvas UI 中的一部分富文本可以像文本框一样被选中并复制（第一阶段只要求复制纯文本）。首个验收点：`About` 对话框中的 `RichText` 可选中并复制。

额外需求：当文本已产生选区且用户右键点击时，弹出**完全由我们控制**的自定义 Context Menu，提供 “Copy” 操作（不使用系统右键菜单）。

## 背景与约束

- UI 运行在 Canvas 上，非 DOM 文本无法直接选中/复制。
- 现有文本输入基于隐藏的 1px `<input>`（`OnePxTextboxBridge` / `TextInputBridge`），通过浏览器原生 selection/clipboard 能力实现光标与复制粘贴。
- `RichText` 目前是“纯绘制”节点（Builder registry 中只 measure/draw，不挂载交互 widget），因此需要补齐交互与 selection 渲染。
- 需要覆盖多行（换行/折行）场景：selection 的 hit-test、范围更新、以及多行高亮绘制。
  - 代码库已经全局 `preventDefault` 了 canvas 的 `contextmenu`（阻止系统菜单），因此右键菜单必须走我们自己的浮层体系。

## 实现思路（两层）

### 1) “隐藏文本宿主”复用：从单行 input 扩展到多行 textarea

抽取并复用 1px 文本桥接的公共逻辑，使其既能驱动单行 `<input>`（TextBox 现状），也能驱动多行 `<textarea>`（RichText selectable）。

建议结构：
- 新增通用工厂：`src/platform/web/1px_text_control.ts`
  - 复用：session 管理、focus/sync/blur、suppressNotify、防止 sync 触发回环、可选 caretRectCss 定位等。
  - 允许传入 element factory（`input` vs `textarea`）与 element id。
- 现有 `src/platform/web/1px_textbox.ts` 改为基于该工厂创建 `<input>` 版本（行为不变）。
- 新增 `src/platform/web/1px_textarea.ts`（或 `1px_textselection.ts`）创建 `<textarea>` 版本：
  - `textarea` 设为 `readOnly = true`（防止输入修改值），但允许 selection 与复制。
  - 与 input 一样监听 `select`（必要时 `input` 也可监听以保持一致）。

### 2) RichText selectable：selection 模型 + canvas 高亮 + 与 textarea 同步

在 Builder 运行时为 `RichTextNode` 增加可选的“可选中”模式：
- `RichTextNode` 增加字段：`selectable?: boolean`
- `components.tsx` 的 `RichText` 增加 props：`selectable?: boolean`
- `richTextNode(...)` 把该字段写入 node

当 `selectable` 为真时，不再走“仅 drawOps 绘制”，而是挂载一个可交互 widget（类似 TextBox / ListRow）：
- 新增 widget：`src/ui/widgets/rich_text_selectable.ts`
  - 继承 `UIElement`
  - 维护状态：
    - `rect`
    - `focused`
    - `dragAnchorIndex: number | null`
    - `selectionStart/End`
    - `sessionId`（用于 textarea bridge）
    - `cachedText`（来自当前 layout 的纯文本）
  - 交互：
    - `canFocus()`：`selectable && active`
    - `onFocus/onBlur()`：focus/blur textarea bridge
    - `onPointerDown`：requestFocus + 根据指针位置计算 index，设置 selection，capture
    - `onPointerMove`：更新 selection（多行 hit-test）
    - `onPointerUp`：结束 drag，sync
    - `onKeyDown`：参考 TextBox：
      - `Ctrl/Cmd+A` 选择全部（更新 selection + sync）
      - `Ctrl/Cmd+C` 标记 consume 但不 preventDefault（让浏览器执行复制）
      - 箭头/Shift+箭头：第一阶段可不做自定义（交给 textarea），但需要通过 textarea 的 `select` 事件把 selection 回推并重绘高亮
  - 绘制：
    - 复用 `createRichTextBlock` 的 layout：调用 `block.measure(ctx, rect.w)`，读取 `block.getLayout()` 获取 lines/runs。
    - 计算“当前 layout 的纯文本”：按 layout 的 lines/runs 拼接（在行间插入 `\\n`），以保证 selection index 与视觉一致。
    - 绘制 selection 高亮：
      - 对每行根据 selection 范围求交，计算该行的 xStart/xEnd，并绘制矩形（使用 theme 中与 TextBox selection 类似的颜色，或新增一个 `theme.colors.richTextSelectionBg`）。
      - 然后调用 `block.draw(...)` 绘制文本。
    - 光标（caret）第一阶段可不画；只需 selection 背景即可满足“可选中/可复制”。

多行 hit-test 与范围映射（核心难点）：
- 行命中：利用 `layout.lines[].y` 与 `base.lineHeight`，把 `p.y - origin.y` 映射到 line index（clamp）。
- 行内 x 命中：
  - 先计算 align 偏移 `xOffset`（与 `drawRichText` 一致）。
  - 在该行 runs 中找到 `x` 所在 run；若在 run 左侧/右侧则落在边界。
  - 在 run 内用“前缀宽度二分查找”定位字符边界：
    - 使用与 layout 相同的 font（run.font），在 `measureTextWidth(ctx, prefix, font)` 上做二分。
    - 为性能可按 run 缓存“字符宽度前缀数组”（用 grapheme segmenter），但第一阶段可先不缓存，后续再优化。
- 全局 index 计算：
  - 在生成纯文本时同时生成每行的 `lineStartIndex`，run 的 `runStartIndex`，用于将 (line, run, offset) 变为全局 index。

与 textarea bridge 同步：
- textarea 的 value 设置为当前 `cachedText`（layout 拼接的纯文本）。
- 每次 selection 更新时同步 `selectionStart/End` 到 textarea（保证 Ctrl+C 能复制当前选区）。
- 监听 textarea 的 `select` 事件回推 selection（支持用户使用 Shift+Arrow 等键盘操作改变选区，同时更新 canvas 高亮）。

### 3) 自定义 Context Menu：右键弹出并复制（纯文本）

目标是“右键选中时弹出我们自己的菜单，而不是系统菜单”。复用现有菜单体系（`MenuStack` + `TopLayerController`）：

- 新增一个通用剪贴板写入 helper：`src/platform/web/clipboard.ts`
  - `writeTextToClipboard(text: string): Promise<boolean>`
  - 优先使用 `navigator.clipboard.writeText(text)`（存在权限/https 限制时可能失败）
  - fallback：使用隐藏 textarea（可复用 1px textarea）执行 `document.execCommand("copy")`（仅作为后备）
- `RichTextSelectable` 在 `onPointerDown` 处理右键：
  - 条件：`e.button === 2` 且 `selectionStart !== selectionEnd`
  - 不改变当前 selection（保持右键只是打开菜单）
  - 在指针位置（用一个 1×1 的 anchor rect）调用 `MenuStack.openRoot(...)` 弹出菜单
  - 菜单项仅需：
    - `Copy`：执行 `writeTextToClipboard(selectedText)`；随后关闭菜单
  - 菜单关闭策略：
    - 依赖 `TopLayerController` 的 light dismiss（点外关闭）
    - 或在 copy 之后显式 `closeAll()`

说明：本方案下，复制不依赖键盘 `Ctrl/Cmd+C`。键盘复制仍可作为增强项保留（textarea 聚焦时也能工作），但验收以右键菜单 Copy 为主。

## Builder/Runtime 集成点

需要让 selectable rich text 能参与 hitTest 与焦点系统，因此必须成为 `UIElement`：
- `src/ui/builder/runtime.ts`
  - 增加一个 `richTexts` widget cell map（类似 textboxes/rows）
  - 提供 `mountRichTextSelectable(path, rect, node, active)` 方法
- `src/ui/builder/registry.ts`
  - `richTextHandler.mount` 中：
    - 若 `node.selectable` 为真：调用 `engine.runtime.mountRichTextSelectable(...)`
    - 否则保持原 drawOps 绘制路径

## About 对话框验收改动

- 在 `About` 对话框把 `RichText` 标记为 `selectable`：
  - `src/ui/window/about_dialog.tsx`：`<RichText selectable tone="muted"> ...`

## 测试与回归

单元测试（优先级从高到低）：
1) 新增 textarea bridge 测试（仿照 `1px_textbox.test.ts`）：
   - focus/sync selection
   - select 事件回调
   - blur 清理 session
2) 新增剪贴板 helper 的测试（以 fallback 分支为主，navigator.clipboard 在测试环境可能不可用）：
   - 当 `navigator.clipboard` 不存在时，能走 execCommand fallback，并返回 true/false
2) RichText selectable 的纯文本拼接与 selection clamp（可做纯函数单测，如果抽出 helper）。

全量回归：
- `bun run check`
- `bun test`

## 交付物清单（执行阶段会改动/新增）

- 新增：`src/platform/web/1px_text_control.ts`（公共逻辑）
- 修改：`src/platform/web/1px_textbox.ts`（迁移到公共逻辑，行为保持）
- 新增：`src/platform/web/1px_textarea.ts`（多行 selection bridge）
- 修改：`src/platform/web/text_input.ts`（如需暴露新 bridge 的入口，或新增 `text_selection.ts`）
- 新增：`src/platform/web/clipboard.ts`（自定义菜单 Copy 的剪贴板写入）
- 修改：`src/ui/builder/types.ts`（`RichTextNode.selectable?: boolean`）
- 修改：`src/ui/builder/components.tsx`（`RichText` 增加 prop 并透传）
- 修改：`src/ui/builder/registry.ts`、`src/ui/builder/runtime.ts`（挂载 selectable rich text widget）
- 新增：`src/ui/widgets/rich_text_selectable.ts`（选择、同步、绘制）
- 修改：`src/ui/widgets/index.ts`（导出新 widget，若该目录有统一出口）
- 修改：`src/ui/window/about_dialog.tsx`（启用 selectable）
- 新增测试：`src/platform/web/1px_textarea.test.ts`（或合并到现有测试文件）

## 验收标准

- 打开 About 对话框，鼠标拖拽可在 `RichText` 上形成可见高亮。
- 右键点击选区弹出自定义 Context Menu，并且点击 Copy 能将选区内容复制到剪贴板（纯文本即可）。
- `Ctrl/Cmd+C` 复制可作为增强项保留，但不作为第一验收门槛。
- `Ctrl/Cmd+A` 在该 RichText 聚焦时能全选并可复制。
- 不影响现有 TextBox 输入/复制粘贴行为。
- `bun run check` 与 `bun test` 全量通过。
