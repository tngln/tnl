# Layout / Flex 说明

本文说明当前 `src/core/layout.ts` 的真实能力，以及它在 Builder 里的使用方式。主入口说明仍然是 [canvas-interface.md](./canvas-interface.md)。

## 1. 当前定位

`core/layout.ts` 已经不是单纯的计划稿，而是实际被 Builder engine 消费的布局层。

当前主要使用方：

- `src/ui/builder/engine.ts`
- `src/ui/builder/registry.ts`

当前典型结果：

- JSX / Builder 页面不再主要依赖手算坐标
- `PanelColumn`、`PanelScroll`、`FormRow`、`ToolbarRow` 等都建立在这层布局语义上

## 2. 当前支持的布局属性

`LayoutStyle` 当前字段：

```ts
type LayoutStyle = {
  axis?: "row" | "column" | "stack"
  gap?: number
  rowGap?: number
  columnGap?: number
  padding?: Padding
  inset?: Padding
  margin?: Padding
  justify?: "start" | "center" | "end" | "space-between"
  align?: "start" | "center" | "end" | "stretch"
  alignSelf?: "start" | "center" | "end" | "stretch"
  position?: "flow" | "overlay"
  overflow?: "visible" | "clip" | "scroll"

  w?: number | "auto"
  h?: number | "auto"
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number

  grow?: number
  shrink?: number
  basis?: number | "auto"
  fixed?: number
  fill?: boolean
}
```

## 3. 当前语义

### 3.1 容器轴向

- `axis: "row"`
  - 主轴为横向
- `axis: "column"`
  - 主轴为纵向
- `axis: "stack"`
  - 子节点叠放在同一个区域内

### 3.2 尺寸分配

- `fixed`
  - 直接指定主轴固定尺寸
- `fill`
  - 占满父级分配给它的空间
- `grow`
  - 主轴剩余空间分配权重
- `shrink`
  - 主轴空间不足时的收缩权重
- `basis`
  - 主轴基础尺寸

当前最常用的简化写法：

- 固定宽按钮：`style={{ fixed: 120 }}`
- 占满剩余空间：`style={{ fill: true }}`
- 顶开右侧内容：`<Spacer style={{ fill: true }} />`

### 3.3 间距与盒模型

- `padding`
  - 内容内边距
- `inset`
  - 节点整体再向内收一层
- `margin`
  - 节点与邻居之间的外边距
- `gap`
  - 主轴间距
- `rowGap` / `columnGap`
  - 对不同轴额外指定 gap

### 3.4 对齐

- `justify`
  - 主轴分布
- `align`
  - 交叉轴对齐
- `alignSelf`
  - 子节点覆盖容器 `align`

### 3.5 定位模式

- `position: "flow"`
  - 参与主轴排布
- `position: "overlay"`
  - 不参与主轴排布，叠放在容器内容区上

`overlay` 适合：

- 角标
- 覆盖层
- stack 容器里的浮动元素

### 3.6 `overflow`

`overflow` 当前是布局语义位，不等于“自动滚动实现”。

也就是说：

- Builder 页面要滚动，仍然优先使用 `ScrollArea` / `PanelScroll`
- 更底层的复杂组件，要滚动则继续使用 `ViewportElement + Scrollbar`

## 4. 当前暴露的纯函数

布局层当前对外的核心函数是：

- `measureLayout(node, max)`
- `layout(node, outer)`
- `resolvePadding(padding)`

其中：

- `measureLayout(...)`
  - 给一个节点树测量自然尺寸
- `layout(...)`
  - 真正把 `rect` 写回每个节点

Builder engine 当前的流程就是：

1. 先把 JSX / BuilderNode 转成 AST。
2. 用 `measureLayout(...)` 测量内容高度。
3. 再用 `layout(...)` 写回每个节点的 `rect`。
4. 最后按 `rect` 执行绘制和控件挂载。

## 5. Builder 里的常见模式

### 5.1 整页纵向布局

```tsx
<PanelColumn>
  <PanelHeader title="Window Manager" meta="3 windows" />
  <PanelActionRow compact actions={[...]} />
  <PanelScroll>{content}</PanelScroll>
</PanelColumn>
```

`PanelColumn` 已经默认给出：

- `axis: "column"`
- `padding`
- `gap`
- 基础文本样式

### 5.2 左右分布

```tsx
<Row style={{ align: "center", gap: 8 }}>
  <Text tone="muted">Label</Text>
  <Spacer style={{ fill: true }} />
  <Text>Value</Text>
</Row>
```

### 5.3 固定标签 + 自适应字段

```tsx
<FormRow
  label="Codec"
  labelWidth={92}
  field={<Button text="Probe" style={{ fixed: 120 }} onClick={probe} />}
/>
```

### 5.4 可滚动列表

```tsx
<PanelScroll>
  <Column style={{ axis: "column", gap: 0, padding: { l: 2, t: 2, r: 14, b: 2 }, w: "auto", h: "auto" }}>
    {rows}
  </Column>
</PanelScroll>
```

这里内部 `Column` 通常会显式写 `w: "auto"` / `h: "auto"`，让内容高度按子项自然增长，再交给外层 scroll area 管滚动。

## 6. 当前使用建议

继续写页面时，优先遵守这几条：

- 普通面板先用 Builder 组件，不先算坐标。
- 先试 `PanelColumn` / `PanelScroll` / `PanelSection`，再决定是否需要更细的 `Row` / `Column`。
- 需要占满剩余空间时，优先 `fill` 或 `Spacer`，不要先写 magic number。
- 需要滚动时，普通页面用 `ScrollArea` / `PanelScroll`，不要把 `overflow` 当成自动滚动实现。
- 只有复杂编辑器控件，才直接脱离 Builder，用类式 `Surface` 管自己的局部布局。
