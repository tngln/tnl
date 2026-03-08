## 现状更新
- 本文是 layout 系统的初始设计稿。
- 当前 `src/core/layout.ts` 已经实现并扩展到比原计划更高一层的能力：
  - `row` / `column` / `stack`
  - `padding` / `inset` / `margin`
  - `gap` / `rowGap` / `columnGap`
  - `grow` / `shrink` / `basis`
  - `fixed` / `fill`
  - `position: "flow" | "overlay"`
  - `overflow`
  - `measureLayout(...)` 与测量缓存
- 当前 layout 的主要消费方不是直接的 `UIElement`，而是 Builder engine。
- 当前继续开发时，请优先参考：`UI系统现状与调用约定.md`

## 目标
- 在 core/layout.ts 设计并实现一个简易、类 Flexbox 的排版系统，用于把“绝对位置手算”转为“从外到内的自动布局”。
- 仅做布局（计算每个节点的 Rect），不负责绘制；布局结果可被 UI/绘制层直接使用。
- 支持单轴（row/column）布局、gap/padding、对齐、以及 grow/shrink 在主轴上分配/回收剩余空间。
- 不引入大量类；优先使用轻量对象/纯函数 + 少量枚举/联合类型，避免高频创建/销毁成本。
- 将“Layout（类 Flexbox）”作为 Phase 0 的一个额外目标记录到 Phase 0 目标清单中（后续在仓库的 Phase 0 规划文档里落地）。

## 范围与非目标
- **范围**
  - 单容器（layout container）对子节点进行主轴排布，并递归对子节点继续做从外到内的布局。
  - 叶子节点通过 measure 回调提供“内容自然尺寸”（intrinsic size）。
  - 对于每个节点输出：`rect: {x,y,w,h}`（逻辑坐标）。
- **非目标（Phase 0 不做）**
  - 多行换行（flex-wrap）、复杂的 baseline 对齐、百分比尺寸、min/max-content 规则、绝对定位、滚动布局。
  - 复杂的文本排版（由 draw/Text 处理）。

## 核心数据结构（建议）
- **Axis**
  - `row | column`
- **LayoutStyle（可配置项）**
  - `axis`: 主轴方向（row/column）
  - `gap`: 主轴间距（number）
  - `padding`: `number | {l,t,r,b}`（简化为全局或四边）
  - `justify`: `start | center | end | space-between`（主轴分布）
  - `align`: `start | center | end | stretch`（交叉轴对齐）
  - `w/h`: `number | "auto"`（容器/节点显式尺寸；auto 则由父布局约束/measure 决定）
  - `minW/minH` 与 `maxW/maxH`（可选，先做最常用的最小值约束也可）
  - `grow`: number（默认 0）
  - `shrink`: number（默认 1）
  - `basis`: `number | "auto"`（主轴基础尺寸；auto 则来自 measure 或显式 w/h）
  - `alignSelf`: 可选，覆盖容器 align（start/center/end/stretch）
- **LayoutNode（轻量对象）**
  - `style: LayoutStyle`
  - `children?: LayoutNode[]`
  - `measure?: (max: {w:number; h:number}) => {w:number; h:number}`（叶子用；容器可不需要）
  - `rect?: Rect`（输出，或由 layout() 返回）
  - `id?: string`（可选，便于调试/测试）

## API 设计（建议）
- `layout(root: LayoutNode, outer: Rect): LayoutNode` 或 `layout(root, outer): Rect[]/Map`
  - 输入 outer 为根节点可用空间（逻辑坐标）
  - 输出可选择：
    - 直接写回每个 node 的 `rect`
    - 或返回 `Map<LayoutNode, Rect>`（更纯粹，但会有 Map 分配）
- `resolvePadding(padding): {l,t,r,b}`
- `clampSize(size, min/max)`

## 布局算法（单轴简化版）
- 对容器节点：
  - 计算 contentBox：`outer` 去掉 padding 得到可用区域。
  - 主轴可用长度 `mainAvail`，交叉轴可用长度 `crossAvail`。
  - 对每个 child 先确定 base size（主轴）：
    - `basis` 为 number → base = basis
    - `basis` 为 auto：
      - 若 axis=row 且 child.style.w 为 number → base = w；否则用 `measure(max)` 的 w
      - 若 axis=column 同理取 h
  - 计算 base 总和：`sumBase + gap*(n-1)`。
  - **grow 分配**：若 `sumBase < mainAvail` 且存在 grow>0：
    - extra = mainAvail - sumBase
    - 每个 child 追加：`extra * (child.grow / totalGrow)`
  - **shrink 回收**：若 `sumBase > mainAvail` 且存在 shrink>0：
    - deficit = sumBase - mainAvail
    - 每个 child 减少：`deficit * (child.shrink / totalShrink)`，并应用 minW/minH（如实现）
  - 计算主轴起始偏移（justify）：
    - start/center/end/space-between
  - 逐个放置 child rect：
    - 主轴位置累加（含 gap）
    - 交叉轴尺寸：
      - align/stretch：stretch 则 crossSize = crossAvail，否则来自 measure/显式尺寸
      - alignSelf 覆盖 align
  - 对每个 child 递归调用 layout(child, childRect)（从外到内）。
- 对叶子节点：
  - 若父已给定 childRect（含 stretch 情况），叶子只需接受并写回。
  - 若需要由叶子决定自身尺寸：使用 measure(max) 决定 w/h，再由父控制摆放。

## 与现有 UI 系统的集成计划
- 新增 `src/core/layout.ts`（仅纯布局与类型，不依赖 Canvas/UI）。
- 为 UIElement 增加可选 `layoutNode()` 或 `layoutStyle/measure`：
  - Phase 0 最小集成：在某些容器控件（如窗口 body 内）先试用 layout 以减少绝对定位。
  - 不强制所有 UIElement 一次性迁移，允许逐步替换。
- 命中测试：
  - 继续以 UIElement.bounds()/containsPoint 为主；布局只负责更新 bounds 所用的 rect。

## 质量与验证
- 单元测试（优先）：
  - row/column 基本排列、gap/padding
  - grow 分配、shrink 回收
  - align/stretch/justify 组合的几个典型用例
- 手工验证：
  - 在现有 demo 窗口里引入一个简单布局容器（后续执行阶段实现），确保视觉/命中正常。

## 迁移策略
- 第一步：只落地 layout.ts 与测试；不改动现有 UI 逻辑，避免大面积回归。
- 第二步：在一个小范围（例如 AboutWindow 内容区）用布局系统替换手写坐标，验证体验。
- 第三步：逐步推广到更多窗口/面板。

## Phase 0 目标更新（计划）
- 在 Phase 0 目标中新增条目：“提供简易 Flexbox-like 布局（core/layout.ts）以简化 UI 绝对定位。”
