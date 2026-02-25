## 目标
- 引入 `invalidateRect()` 与“脏矩形（dirty rect）”机制，减少帧与帧之间不必要的全量重画。
- 在不引入复杂渲染树/保留缓存（retained rendering）的前提下，优先做到：
  - **只清屏/重绘需要更新的区域**
  - **尽量减少遍历与绘制开销**（通过 bounds 与裁切做粗粒度 culling）
- 保持现有 UI 编程模型（`UIElement` 即时绘制 + pointer 事件）不被破坏；允许分阶段演进。

## 现状梳理（作为设计约束）
- 渲染入口：`CanvasUI.invalidate()` 使用 RAF 调度，`render()` 每次都：
  - `ctx.setTransform(dpr, ...)`
  - `fillRect(0,0,cssW,cssH)` 全量背景
  - `root.draw(ctx)` 全量绘制
- UIElement 没有“渲染脏标记”或“布局缓存”的概念；靠外部 effect/事件来触发 `invalidate()`。
- 目前 `ViewportElement` 已引入 clip/坐标变换；脏矩形需要与 clip 友好共存。

## 设计概览
### 新 API
- `CanvasUI.invalidateRect(r: Rect, opts?: { pad?: number; force?: boolean })`
  - 将 CSS 坐标系下的矩形加入 dirty 列表
  - `pad`：对矩形做扩张（用于阴影/抗锯齿溢出）
  - `force`：等同 `invalidate()`（直接全量重绘）
- `CanvasUI.invalidate()` 保留：等同“全屏脏”
-（可选）`CanvasUI.invalidateElement(el: UIElement, pad?: number)`：基于 `el.bounds()` 计算 dirty

### DirtyRect 策略
- 内部维护：`dirty: Rect[]`（CSS 坐标）
- 入队时：
  - `normalize`（确保 w/h ≥ 0）
  - `pad` 扩张（默认 1~2px；窗口阴影可更大）
  - `clamp` 到 `{0..cssW, 0..cssH}`
  - 与现有 dirty 进行合并（overlap/touch 合并），避免碎片化
- 退化策略：
  - dirty 数量超过阈值（如 32）或总面积占屏幕比例过高（如 > 40%）→ 直接转为全屏 dirty

### 渲染策略（最小可行）
- 每帧 render 时：
  - 若没有 dirty → 不做任何绘制（跳过）
  - 若 dirty 是全屏 → 走现有全量路径
  - 否则对每个 dirty rect：
    1. `ctx.save(); ctx.beginPath(); ctx.rect(d.x,d.y,d.w,d.h); ctx.clip()`
    2. 仅填充该区域背景（appBg）
    3. 调用 `root.draw(ctx)`（但会被 clip 限制，只会实际画到该区域）
    4. `ctx.restore()`
- 优点：改动小、实现稳、立刻减少 GPU/Canvas 的像素填充量（尤其在大画布上）。
- 代价：仍会遍历所有 UIElement（但像素绘制被 clip 限制）；下一阶段再引入 bounds culling。

## 配套工具（rect 工具集）
在 `src/core/rect.ts`（或 `src/ui/rect.ts`）提供：
- `normalizeRect(r): Rect`
- `clampRect(r, bounds): Rect | null`
- `inflateRect(r, pad): Rect`
- `intersects(a,b): boolean`
- `union(a,b): Rect`
- `mergeRects(rects, next): Rect[]`（把 next 合并入列表）
-（可选）`area(r)`、`sumArea(rects)`

## bounds culling（第二阶段，减少遍历）
在 `UIElement.draw` 增加可选参数 `clip?: Rect`：
- 若提供 clip，且 `!rectIntersects(this.bounds(), clip)` → 直接 return（跳过自身及 children）
- 注意：
  - Root bounds 是“无限大”，不会被剔除
  - 对 `ViewportElement`、窗口等具有明确 bounds 的元素，会显著减少遍历开销
- 不改变现有 draw 调用方式：`root.draw(ctx)` 仍可用；dirty render 里调用 `root.draw(ctx, dirtyRect)`

## 事件侧的 invalidateRect 接入（第三阶段）
先保证现有逻辑不回归，再逐步把高频全量 invalidate 改为局部：
- hover 切换：
  - 旧 hover bounds ∪ 新 hover bounds → `invalidateRect`
- 按下/抬起（button/checkbox/radio）：
  - 控件自身 bounds → `invalidateRect`
- 窗口拖拽/缩放：
  - 旧窗口 bounds ∪ 新窗口 bounds（加 pad 覆盖阴影）→ `invalidateRect`
- 最小化/还原：
  - 旧窗口 bounds ∪ 新窗口 bounds ∪ 左下角 tile bounds → `invalidateRect`
- 说明：由于目前状态更新分散在 Signal/effect 中，优先从 pointer 交互路径接入（收益最大、最可控）。

## 与 Surface/Viewport 的关系
- ViewportElement 自带 clip；dirty rect 的 clip 发生在更外层（CanvasUI），两者可叠加：
  - CanvasUI clip（dirty） ∩ Viewport clip（viewport rect） ∩（内容 clip）→ 最终实际绘制区域更小
- Surface 内部控件变化时，理想情况是只 `invalidateRect(viewport.bounds())` 或更小；先从 ViewportElement 作为事件代理点接入（例如控件 hover/down 改变时，ViewportElement 可调用一个注入的 invalidator）。

## 落地步骤（按提交粒度）
1. **基础设施**
   - 新增 rect 工具集
   - CanvasUI 增加 `invalidateRect` 与 dirty 列表
   - render 支持 dirty 裁切重绘（不做 bounds culling）
   - resize/首次渲染：强制全屏 dirty
2. **bounds culling**
   - UIElement.draw 支持可选 clip rect（保持原签名兼容，或新增重载方法）
   - dirty render 调用 `root.draw(ctx, dirtyRect)`
3. **接入高频交互**
   - CanvasUI hover 切换、pointerdown/up：改用 `invalidateRect`（旧/新 bounds union）
   - ModalWindow 拖拽/缩放：改为局部 dirty（旧/新 union + pad）
4. **验证与回归**
   - 手动验证：Developer/ About 窗口拖拽、缩放、最小化堆叠、控件 hover/click
   - 性能观察：在大窗口下 hover/点击时只有局部区域闪动/更新，避免全屏重画

## 风险与处理
- 阴影溢出导致脏矩形不够大：通过 `pad` 扩张，以及窗口类调用时使用更大 pad（≈ shadow blur + offset）。
- 多脏矩形 clip 叠加导致重复遍历：合并算法 + 阈值退化为全屏。
- 未来要引入滚动条/动画：可把动画元素定期 `invalidateRect`（时间驱动）而不必全屏。

