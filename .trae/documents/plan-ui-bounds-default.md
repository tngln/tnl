# UIElement bounds 去冗余方案（Plan）

## 现状更新
- 本文档是 UIElement bounds 去冗余的初始计划。
- **当前状态：⚠️ 部分实现**
- `UIElement` 已实现声明式 bounds 机制
- 大量 widgets 已迁移使用 `setBounds()`

## 背景与问题（已识别）
当前 `ui.ts` 中 `UIElement` 定义了 `abstract bounds(): Rect`，导致所有 `class ... extends UIElement` 都必须实现 `bounds()`。

在实际代码里，大量实现属于模板化写法：

* `if (!active/hidden/visible) return ZERO_RECT; return rectValue`

* `if (r.w <= 0 || r.h <= 0) return ZERO_RECT; return r`

这类实现重复度高、噪音大，且推动了"到处写 ZERO_RECT"的风格扩散。

## 目标（部分完成）
* 默认情况下元素"不具备 bounds"（等价于不可命中/不可交互），无需强制实现 `bounds()`。

* 当元素需要参与 hitTest/cursorAt/debug bounds 时，通过**显式声明**提供 bounds 数据源：

  * `Rect`（常量矩形）

  * `() => Rect`（动态矩形）

* 对常见的 "active/hidden gating" 提供统一机制，避免每个类写同样的 `if (...) return ZERO_RECT`。

* 保持现有交互语义：不因为重构导致命中测试、光标、debug tree、invalidate 行为改变。

## 现状关键点（约束）
* `hitTest()` / `cursorAt()` 当前会先检查 `this.containsPoint()`（默认用 `pointInRect(p, this.bounds())`），再递归 children。

  * 因此：父元素如果不"命中"，其子元素永远不会被命中。

  * 这意味着"默认无 bounds"如果不配套迁移，会影响交互链路。

  * 本计划采取**迁移式改造**：引入新机制后，逐步把现有 `bounds()` 重复实现改为声明式，不改变命中逻辑。

## 设计方案（部分实现）

### 1) UIElement 内置 bounds 声明
在 `UIElement` 增加两类受保护字段（或等价封装）：

* `protected boundsSpec: Rect | (() => Rect) | null`（默认 `null`，表示未声明 bounds）

* `protected boundsWhen: (() => boolean) | null`（可选 gating；返回 `false` 时视为无 bounds）

并将 `bounds()` 从 `abstract` 改为默认实现：

* 未声明 `boundsSpec` → 返回 `ZERO_RECT`

* 声明了 `boundsSpec`，但 `boundsWhen?.()` 为 `false` → 返回 `ZERO_RECT`

* 否则：

  * `Rect` 直接返回

  * `() => Rect` 执行后返回

再提供一个受保护 helper（便于 subclasses 使用）：

* `protected setBounds(spec: Rect | (() => Rect), when?: () => boolean): void`

* （可选）`protected clearBounds(): void`

### 2) 迁移策略（避免大范围行为变化）
迁移遵循以下规则：

* **只删除"模板化 bounds()"**，改为在构造函数或 update 里调用 `setBounds(...)`。

* 对于 bounds 有特殊语义的类（例如 `SurfaceRoot` 返回超大矩形、或 bounds 依赖复杂几何），保留 override。

* 对于"仅仅为了 active/hidden 返回 ZERO_RECT"的类，统一使用 `when`，例如：

  * `setBounds(() => this.rectValue, () => !this.hidden())`

  * `setBounds(() => this.layout.rect, () => this.layout.rect.w > 0 && this.layout.rect.h > 0)`

## 执行步骤（部分完成）

### 步骤 A：引入 UIElement 声明式 bounds（核心改动）
1. 修改 `ui.ts`：
   * 将 `abstract bounds(): Rect` 改为默认实现的 `bounds(): Rect`
   * 增加 `boundsSpec/boundsWhen`（或等价实现）
   * 增加 `setBounds(...)` helper
2. 确保 `debugDescribe()`、`containsPoint()`、`hitTest()`、`cursorAt()` 行为不变（仍然通过 `bounds()` 获取 Rect）。

### 步骤 B：优先迁移"典型重复"类（高收益、低风险）
1. 迁移 `InteractiveElement`（其子类大量复用）：
   * 在构造函数中调用 `setBounds(this._rect, this._active)`（或等价形式）
   * 删除 `bounds()` override（如果存在）
2. 迁移 `Scrollbar` / `Slider` / `TextBox` / `ListRow` / `TreeRow` 等常用 widgets：
   * 把 `bounds()` 内的 `active/hidden` 判断迁移到 `when`
   * 统一使用 `setBounds(() => rectValue, when)`
3. 迁移 `ViewportElement`、`Window`/`WindowManager` 中明显"返回 rect 或 ZERO_RECT"的实现（如果符合模板化）。

### 步骤 C：清理剩余重复实现（可选但建议）
1. 全仓搜索 `bounds():` 中包含 `return ZERO_RECT` 的模式
2. 逐个判定：
   * 纯模板化 → 迁移为 `setBounds`
   * 有特殊逻辑 → 保留 override
3. 保持每次迁移的编译/测试可通过，避免一次性大扫除导致回滚困难。

### 步骤 D：验证与回归
1. 运行类型检查（`bun run check`）
2. 运行单测（`bun test`），重点关注：
   * pointer cancel / bubbling / drag_drop 等交互测试
   * widgets 的 hover/pressed 行为
3. 进行一次静态扫描：
   * 统计迁移前后 `bounds()` override 数量变化
   * 确认没有"父元素无 bounds 导致子元素不可命中"的退化（通过相关测试与必要的手动验证）

## 风险与对策
* **风险：父节点 bounds 变为 ZERO_RECT 导致子节点命中失败**
  * 直接后果（按当前 hitTest/cursorAt 实现）：父节点 `containsPoint()` 失败会直接短路，子节点不会被递归访问，表现为：
    * 鼠标/触控：子控件无法 hover / pressed / click / drag
    * 光标：子控件的 cursor region 失效（始终拿不到 child cursor）
    * 轮滚：子控件的 wheel handler 不会触发（例如滚动区域"滚不动"）
    * 焦点：如果聚焦依赖命中路径，可能出现"点不进去/无法聚焦"
    * 调试：debug tree 中 bounds 可能显示为 0 区域，影响定位（但不影响绘制本身）
  * 直接例子（来自现有代码）：
    * `ScrollArea` 是一个容器 widget，会创建并持有子元素（viewport 与 scrollbar）。它的 bounds 当前是 "active 才返回 rect，否则 ZERO_RECT"：见 `scroll_area.ts:bounds`。
    * 命中流程在 `ui.ts:hitTest`：
      - 先 `if (!this.containsPoint(p)) return null`
      - 再从 children 逆序递归 `child.hitTest(...)`
    * 因此如果把 `ScrollArea.bounds()`（或将来对应的声明式 bounds）错误变成了 `ZERO_RECT`，即便子元素 scrollbar 本身有正确 bounds，也永远不会被访问到，结果就是"滚动条无法 hover/拖拽/点击、内容区无法接收 wheel"。
  * 对策（本计划执行时遵守）：
    * 迁移阶段不动"容器/路由类"的 bounds（即决定 hitTest 是否下钻的节点）

* **风险：某些类的 bounds 具有语义（例如超大命中区域）被误迁移**
  * 典型例子：`SurfaceRoot` 的 bounds 用于让整个 viewport 都能命中，从而把事件下发到 surface 树。
  * 关于 "把超大 rect 改成 Infinity"：
    * 不建议：当前 `pointInRect` 使用 `p.x <= r.x + r.w` 这类比较；若用 `x=-Infinity, w=Infinity` 会出现 `-Infinity + Infinity = NaN`，导致比较恒为 `false`，命中直接失效。
    * 即便用 `x=0, w=Infinity` 避开 NaN，Infinity 仍可能污染其它矩形运算（union/intersects/inflate/clamp 等），造成不可预期的 NaN/溢出传播。
    * 结论：需要"近似无限"时，应继续使用**足够大的有限数值哨兵**（当前 `2e9` 这一类），或集中定义 `HUGE_RECT` 常量，但不引入 Infinity。
  * 对策：只迁移明显 "return rect / ZERO_RECT" 的实现；对 `SurfaceRoot`、以及任何 bounds 不是简单矩形 gating 的类，保留 override。

## 交付标准（部分完成）
* `UIElement` 不再强制抽象 `bounds()`，默认未声明 bounds 时返回 `ZERO_RECT`。
* 常见 widgets/容器中，重复的 `bounds(): return ZERO_RECT/rect` 实现显著减少。
* `bun run check` 与 `bun test` 全通过。
