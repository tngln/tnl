# Layout / Flex 说明

本文说明当前 `@tnl/canvas-interface/layout` 的真实能力，以及它在 Builder 中的使用方式。

主入口说明仍然是 [canvas-interface.md](./canvas-interface.md)。

## 当前定位

布局层已经是稳定实现，不再是计划稿。

当前主要使用方：

- `packages/canvas-interface/src/builder/engine.ts`
- `packages/canvas-interface/src/builder/registry.ts`

它支撑了：

- JSX / Builder 页面布局
- `PanelColumn`
- `PanelScroll`
- `FormRow`
- `ToolbarRow`

## 当前支持的主要语义

### 容器轴向

- `axis: "row"`
- `axis: "column"`
- `axis: "stack"`

### 尺寸分配

- `fixed`
- `fill`
- `grow`
- `shrink`
- `basis`

### 间距与盒模型

- `padding`
- `inset`
- `margin`
- `gap`
- `rowGap`
- `columnGap`

### 对齐

- `justify`
- `align`
- `alignSelf`

### 溢出语义

- `overflow: "visible" | "clip" | "scroll"`

需要注意：`overflow` 仍然是布局语义，不等于自动滚动条实现。普通页面滚动依然优先用 `ScrollArea` / `PanelScroll`。

## Builder 中的典型使用方式

### 整页纵向布局

```tsx
<PanelColumn>
  <PanelHeader title="Window Manager" meta="3 windows" />
  <PanelActionRow compact actions={[...]} />
  <PanelScroll>{content}</PanelScroll>
</PanelColumn>
```

### 左右分布

```tsx
<Row style={{ align: "center", gap: 8 }}>
  <Text tone="muted">Label</Text>
  <Spacer style={{ fill: true }} />
  <Text>Value</Text>
</Row>
```

### 固定标签 + 自适应字段

```tsx
<FormRow
  label="Codec"
  labelWidth={92}
  field={<Button text="Probe" style={{ fixed: 120 }} onClick={probe} />}
/>
```

## 当前建议

- 普通面板先用 Builder 组件，不先算坐标
- 优先尝试 `PanelColumn` / `PanelScroll` / `PanelSection`
- 需要占满剩余空间时优先用 `fill` 或 `Spacer`
- 普通页面滚动用 `ScrollArea` / `PanelScroll`
- 只有复杂编辑器控件才脱离 Builder 自管局部布局
