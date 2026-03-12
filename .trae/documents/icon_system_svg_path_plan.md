# Icon 系统调研与方案（SVG Path + viewBox）

## 背景与问题

目前在控件内部存在一些“专门画组件的小函数”，典型例子是 Dropdown 内的 `caretDownShape`（通过 `Path2D` 手工 moveTo/lineTo 组装）。这类函数：

- 分散在多个 widget 文件中，重复与风格不一致风险高
- 难以统一尺寸、对齐、颜色与主题语义
- 难以扩展为一套可复用的 icon-set（例如 chevron、caret、close、more 等）

目标是引入一个最小可行的 icon 系统：用 **SVG path 字符串** 表示几何形状，并配套 **viewBox**，以获得可缩放能力与统一的布局/对齐模型。

## 目标

- 引入 `IconDef`（或类似命名）数据结构：`{ viewBox, d }`
  - `d` 为 SVG path 数据字符串
  - `viewBox` 描述 `d` 所在坐标系（x/y/w/h）
- 提供一个“从 IconDef 生成可绘制 Shape”的统一入口
  - 支持把 icon 渲染到目标矩形（x/y/w/h）
  - 默认保留纵横比（preserve aspect ratio），并居中对齐
- 首先迁移 Dropdown 的 `caretDownShape` 为 icon 定义 + 复用入口
- 产出一个可逐步扩展的 icon-set 模块组织方式

## 非目标（本阶段不做）

- 不引入完整 SVG 渲染（只支持 path 的 `d` 字符串）
- 不做多色/渐变/描边体系（先支持 fill）
- 不引入外部图标库或构建期 SVG 编译链
- 不改动现有 hitTest 体系（除非发现 icon 参与命中）

## 现状调研要点

1. `core/draw.ts` 的 `Shape` 类型包含 `viewBox`，但当前绘制实现只使用 `Path2D`，没有使用 `viewBox` 做坐标映射。
2. 当前 icon-like 小函数通常直接在“最终像素坐标系”里构造 Path2D（例如 `caretDownShape(x,y,size)`），缺少可复用的“icon 坐标系 → 目标 rect”变换层。

## 方案设计

### 1) 新增 Icon 数据结构与渲染辅助

新增模块（推荐放在 UI 层，因为 icon 与 UI 主题/控件更相关）：

- `src/ui/icons/types.ts`
  - `export type IconViewBox = { x: number; y: number; w: number; h: number }`
  - `export type IconDef = { viewBox: IconViewBox; d: string }`
  - （可选）`export type IconFit = "contain" | "cover" | "stretch"`
  - （可选）`export type IconAlign = "center" | "start" | "end"`

新增工具函数（放在 `src/ui/icons/render.ts` 或同文件）：

- `iconPath(icon: IconDef): Path2D`
  - `return new Path2D(icon.d)`（依赖浏览器/Canvas 对 SVG path 的支持）
- `iconToShape(icon: IconDef, dst: Rect, opts?): DrawOp`
  - 使用 `Path2D.addPath(path, matrix)` 或 `ctx` 变换来实现坐标映射
  - 映射目标：
    - 将 `icon.viewBox` 坐标系缩放平移到 `dst`（默认 contain + 居中）
    - 计算 `scale = min(dst.w/viewBox.w, dst.h/viewBox.h)`
    - 计算偏移使 icon 在 `dst` 内居中
  - 返回 `draw.Shape({ viewBox: dst, path: transformedPath })` 这样的 DrawOp（或直接返回 `{ kind:"Shape", ... }`）

说明：由于当前 `draw.Shape` 不应用 `viewBox`，所以“变换”需要在构造 `Path2D` 时完成（即生成一个已在目标坐标系中的 Path2D）。

### 2) 建立最小 icon-set

新增 `src/ui/icons/set.ts`（或 `icons.ts`）导出一组常用 icon：

- `caretDown`（替代 Dropdown 的 `caretDownShape`）
- （可选）`chevronRight/chevronDown`（后续可替代 TreeRow disclosure 的 Line 画法）

每个 icon 以 `{ viewBox, d }` 定义；viewBox 尽量使用规范化坐标（例如 0..16 或 0..24）。

### 3) Dropdown 迁移策略

- 在 `dropdown.ts` 删除 `caretDownShape`
- 在绘制处用 `iconToShape(icons.caretDown, dstRect, { ... })` 生成 DrawOp
  - dstRect 由当前控件的 caret 对齐规则决定（例如右侧 padding + 固定 10x10）
  - fill 仍由 theme 颜色决定（保持现有 `theme.colors.textMuted`）

### 4) ListRow/TreeRow 的后续迁移（可选）

本阶段只处理 Dropdown；但会在调研中列出其它 icon-like 代码点，作为后续迁移清单：

- TreeRow disclosure glyph（目前用 Line 画）是否要统一到 icon-set
- Menu/MenuBar 是否存在类似的小 path 组装函数

## 实施步骤（落地顺序）

1. 全局检索 UI widget 中所有 icon-like helper（Path2D/Line 组合）并列出候选集合
2. 新增 `src/ui/icons/*` 模块与 `IconDef` + `iconToShape` 实现
3. 定义 `caretDown` icon（SVG `d` + viewBox）
4. 迁移 Dropdown 绘制逻辑：从 `caretDownShape` 改为 icon-set
5. 运行 `bun run check` 与 `bun test`，确保行为一致
6. （可选）补充一个简单单测：验证 `iconToShape` 在不同 dstRect 下不会抛错且渲染路径可用（若现有测试框架容易覆盖）

## 验收标准

- Dropdown caret 绘制与之前视觉/对齐一致（至少在常见 DPR 下无明显偏移）
- 不再在 Dropdown 内存在 `caretDownShape` 这类一次性 Path2D 构造函数
- `IconDef` 支持 viewBox + path 字符串，并可复用于其它控件
- `bun run check` 与 `bun test` 全通过

