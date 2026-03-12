## 目标

实现一个可用的 `Developer.Surface` 面板，并补齐一组“进阶 Compositor 调试能力”，使其体验接近 Chrome DevTools 的 Layers 面板：

- 能查看当前 Compositor 的离屏图层（layers）列表与关键属性（尺寸、DPR、像素大小、估算内存、上次渲染帧）
- 能查看本帧 blit 记录（layer → 目标 rect、opacity、blend mode），用于理解“为何画在这里”
- 能在运行时高亮某个 layer 的屏幕范围（overlay），辅助定位
- 与现有 UI/Surface/Viewport 调试树（Inspector）形成互补：Inspector 看“节点树/Surface”，Surface 面板看“合成层/离屏层”

## 背景与现状（只读结论）

- `Developer.Surface` 目前是占位面板：[surface_panel.ts](file:///c:/Projects/tnl/src/ui/window/developer/panels/surface_panel.ts)
- 合成器为 `Compositor`，默认 surface 会创建 `layerId = surface:${surface.id}` 的离屏层并在 `ViewportElement` 中 `blit` 回主画布：[compositor.ts](file:///c:/Projects/tnl/src/ui/base/compositor.ts) / [viewport.ts](file:///c:/Projects/tnl/src/ui/base/viewport.ts)
- Compositor 当前缺少公开 debug API（无法列 layers、无法看到本帧 blit 轨迹、无法关联到 surface/viewport）

## 范围

### 必做（MVP）

1. Compositor debug hooks（只读/调试用途，不影响功能语义）
   - 暴露当前 layers 列表（id、css 尺寸、像素尺寸、dpr、canvas 类型、renderedFrame、estimatedBytes）
   - 记录每帧 blit 事件列表（layerId、destRect、opacity、blendMode、frameId）
   - 允许从 `ViewportElement` 给 layer 打标签（例如 surfaceId、viewportRect），用于面板展示“归属”
2. Developer.Surface 面板 UI
   - 左侧 layer 列表（可按 id/归属过滤）
   - 右侧详情（尺寸、内存估算、最后 blit 位置、是否本帧渲染）
   - 选中后可触发 overlay 高亮（矩形描边/填充半透明）与跳转定位信息
3. 基础测试
   - 单元测试覆盖：debug hooks 的输出稳定、blit 记录在 beginFrame 后清空且本帧正确累积
   - 面板至少 smoke test（能 mount、能渲染空/有数据状态）

### 暂不做（后续迭代）

- 复杂图层树（父子层级、3D stacking）
- 图层截图预览/texture preview
- 多图层合成规则可视化（clip、mask、filters）
- 性能时间线（持续采样、多帧统计）

## 设计

### 1) Compositor Debug API 设计

在 `src/ui/base/compositor.ts` 增加一组仅用于调试的结构与方法（命名可按现有风格调整）：

- `debugListLayers(): DebugLayerInfo[]`
  - `id: string`
  - `wCss/hCss/dpr`
  - `wPx/hPx`
  - `canvasType: "offscreen" | "dom"`
  - `renderedFrame: number`
  - `estimatedBytes: number`（≈ wPx*hPx*4）
- `debugGetFrameBlits(): DebugBlitInfo[]`
  - `frameId: number`
  - `layerId: string`
  - `dest: Rect`
  - `opacity: number`
  - `blendMode: GlobalCompositeOperation`
- `debugTagLayer(layerId, tag)`（可选但推荐）
  - `tag: { surfaceId?: string; viewportRect?: Rect }` 等

实现策略：
- `beginFrame` 时清空 `frameBlits`（只保留本帧，避免无限增长）
- `blit` 时 push 记录（透明度、混合模式、destRect）
- `withLayer/ensureLayer` 更新时同步 wCss/hCss/dpr/wPx/hPx/renderedFrame
- Debug API 必须是“只读视图”，不允许外部拿到可变 canvas/context

### 2) Overlay 高亮机制

目标：面板选中某 layer 后，在主画布上显示其 destRect（矩形框）。

推荐实现：
- 在 `CanvasUI` 或绘制主循环中引入一个轻量 overlay 管道（例如一个 `DebugOverlayController` / 或直接利用现有 `TopLayerController`）
- overlay 数据来源：Developer.Surface 面板设置一个 `developerContext.surfaceOverlay`（或在 existing developerContext 下扩展）
- overlay 渲染：每帧在 root.draw 之后绘制（不参与 hitTest），颜色/alpha 固定即可

注意：
- overlay 不应影响交互（hitTest/cursor）
- overlay 要随帧重绘（因此需要 invalidate / 或每帧都画）

### 3) Developer.Surface 面板 UI

实现位置：复用现有 Developer panel 的 TSX/defineSurface 模式（参考 Data/Inspector）。

面板结构（建议）：
- 顶部：简单工具条（刷新/冻结、filter 输入框）
- 主区：左右分栏
  - 左：layers 列表（显示 id + 归属 surfaceId + w×h@dpr）
  - 右：详情（blit 次数、本帧是否渲染、last dest rect、estimatedBytes）
- 点击列表项：选中并触发 overlay 高亮
- hover 列表项：可选临时高亮（非必须）

数据接入：
- 扩展 `DeveloperContext`，增加 `surface` 字段（例如 `{ compositorDebug: () => ... }`）
- 在 `main.ts` 注入对应 getter（从 `CanvasUI` 拿 compositor 实例，或通过 runtime 暴露）

## 实施步骤（执行阶段）

1. 加 Compositor debug hooks
   - 修改 `compositor.ts`：新增 debug 数据结构、beginFrame 清空、blit 记录、list API
   - 修改 `viewport.ts`：在默认 layerId 路径上调用 `debugTagLayer`（如采用）
2. 打通 DeveloperContext 数据源
   - 修改 `src/ui/window/developer/index.ts`：扩展 `DeveloperContext` 类型包含 surface/compositor debug 数据
   - 修改 `main.ts`：注入 surface debug provider（从运行时拿 compositor）
3. 实现 Developer.Surface 面板
   - 替换占位的 `surface_panel.ts` 为真实面板（defineSurface + list/detail + overlay 控制）
4. 实现 overlay
   - 在绘制管线中加入 overlay 绘制点（root.draw 之后）
   - 通过 developerContext 控制选中 rect
5. 测试与回归
   - 新增 compositor debug 单测（listLayers / frameBlits）
   - 面板 smoke test（若现有 test harness 支持）
   - `bun run check`、`bun test`

## 验收标准

- Developer.Surface 面板能展示当前 layers 与本帧 blits，数据随帧变化
- 选择某 layer 可在画布上看到对应 destRect 的高亮 overlay
- 不影响现有渲染/交互语义（菜单、dock、viewport hitTest 等仍工作）
- 测试覆盖关键 debug API 且全量测试通过

