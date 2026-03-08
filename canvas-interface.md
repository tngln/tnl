
# Canvas UI Interface Documentation

本文档描述了 TNL (Tung's Non-Linear Editor) 项目的 Canvas UI 基础设施。这是一套高性能、无框架依赖、基于 Canvas 2D 的 UI 系统，专为复杂的非编应用场景设计。

## 1. 设计哲学 (Philosophy)

- **Canvas-First**: 所有 UI（包括文本、图标、布局）均由 Canvas 绘制，不依赖 DOM 元素（除了根 Canvas 本身）。这保证了渲染的一致性和高性能。
- **Reactivity-Driven**: 状态管理依赖细粒度的 Signal/Effect 系统。UI 组件通过订阅 Signal 自动重绘，无需手动管理复杂的更新逻辑。
- **Retained Structure, Immediate Drawing**: 维护一棵持久的 `UIElement` 树用于事件分发和布局，但在绘制时采用即时模式（Immediate Mode）风格的声明式绘图指令。
- **Surface/Viewport Separation**: 将“内容定义”（Surface）与“显示窗口”（Viewport）分离，天然支持无限画布、缩放、裁剪和虚拟滚动。
- **Performance Optimized**: 内置脏矩形（Dirty Rect）渲染、图层合成（Compositor）和 OffscreenCanvas 缓存机制。

## 2. 响应式系统 (Reactivity System)

TNL 拥有一个内置的、细粒度的响应式系统，位于 `src/core/reactivity.ts`。它是 UI 状态流转的核心。

### 核心原语
- **`signal<T>(initial)`**: 创建一个可读写的响应式状态。
  - `get()`: 读取值并自动追踪依赖（如果在 effect 中）。
  - `set(val)`: 更新值并触发依赖更新。
  - `peek()`: 读取值但不追踪依赖。
- **`effect(fn)`**: 创建一个副作用函数。它会自动运行一次，并在其依赖的 signal 变化时重新运行。
- **`computed<T>(fn)`**: 创建一个派生 signal，其值由函数计算得出，并随依赖自动更新。

### UI 集成模式
UI 组件通常不直接持有状态，而是持有 `Signal` 或 `Getter` (`() => T`)。

```typescript
// 推荐模式：Props 接收 Getter
class MyWidget extends UIElement {
  constructor(private value: () => number) { super() }
  
  onDraw(ctx) {
    // 读取 value() 会建立依赖（如果是 computed/signal）
    // 但注意：onDraw 本身不是 effect，通常由外部 effect 驱动 invalidate
    // 或者组件内部 effect 监听 value 变化调用 invalidate
    const v = this.value()
    // ...
  }
}
```

*注意：目前的 `UIElement` 并不自动将 `onDraw` 包装为 effect。通常由上层逻辑（如 `Surface` 或业务逻辑）在 signal 变化时显式调用 `ui.invalidate()` 或 `invalidateRect()`。*

## 3. 核心原语 (Core Primitives)

### 3.1 UIElement
所有 UI 节点的基类。
- **职责**: 维护父子关系、可见性、Z-index，提供事件回调接口。
- **关键方法**:
  - `bounds(): Rect`: 返回元素在父坐标系下的包围盒（用于命中测试和脏矩形计算）。
  - `onDraw(ctx)`: 执行具体的绘制逻辑。
  - `hitTest(p)`: 递归查找命中的子元素。
  - 事件回调: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onWheel`, `onPointerEnter`, `onPointerLeave`。

### 3.2 CanvasUI
UI 系统的根管理器。
- **职责**: 管理 HTMLCanvasElement，主渲染循环，事件监听与分发，脏矩形追踪。
- **关键 API**:
  - `invalidateRect(rect, opts)`: 标记区域为脏，触发下一帧重绘。
    - 自动合并相邻的脏矩形。
    - 当脏区域过多或过大（>40%）时，自动退化为全屏重绘。
  - `render()`: 遍历脏矩形列表，执行裁剪并调用根节点的 `draw`。

### 3.3 Surface & Viewport
这是本系统最独特的设计之一，用于处理可滚动、可缩放的内容。

- **Surface (内容层)**:
  - 一个纯粹的渲染定义接口，不持有状态（通常）。
  - 接口: `render(ctx, vp)`, `hitTest(p, vp)`, `onPointer*(e, vp)`。
  - 它可以被多个 Viewport 复用。
  - **高级特性**: 支持 `blendMode`, `opacity` 以及自定义 `compose` 逻辑。

- **ViewportElement (视口层)**:
  - 一个 `UIElement`，负责定义显示区域（Rect）、裁剪（Clip）、滚动偏移（Scroll）和坐标变换。
  - 它持有 `target: Surface`。
  - 在渲染时，它计算 `ViewportContext`（包含坐标转换矩阵），并调用 target Surface 的 `render`。
  - **坐标转换**: 提供 `vp.toSurface(p)` 将视口坐标转换为内容坐标。

### 3.4 Compositor (合成器)
用于管理离屏渲染和图层混合，位于 `src/ui/base/compositor.ts`。
- **Offscreen Buffer 管理**: 自动创建、复用和调整 OffscreenCanvas (或 DOM Canvas) 的尺寸。
- **帧缓存**: 能够缓存某一帧的渲染结果，避免重复绘制静态内容。
- **混合模式**: 支持 Canvas 的 `globalCompositeOperation` (如 `screen`, `overlay`, `multiply`)。

```typescript
// 在 Surface.render 或 compose 中使用
compositor.withLayer("my-layer-id", w, h, dpr, (ctx) => {
  // 在离屏 canvas 上绘制
  ctx.fillStyle = "red"; ctx.fillRect(0,0,w,h);
});
// 合成回主画布
compositor.blit("my-layer-id", destRect, { blendMode: "screen", opacity: 0.5 });
```

## 4. 绘图系统 (Drawing System)

我们采用声明式的绘图 API，定义在 `src/core/draw.ts`。

### `draw(ctx, ...ops)`
核心绘制函数，接受一系列 `DrawOp` 指令。它统一处理了 Shadow、Transform 和 Pixel Snapping。

### 常用 Op 构造函数
- `Rect(r, style)`: 矩形。
- `RRect(rr, style)`: 圆角矩形。
- `Circle(c, style)`: 圆形。
- `Text(t)`: 文本（支持 `maxWidth`）。
- `Line(a, b, stroke)`: 线段。
- `Shape(s, fill)`: 任意 Path2D 形状。

### 样式对象
- `FillStyle`: `{ color, shadow? }`
- `StrokeStyle`: `{ color, width, hairline?, dash?, shadow? }`
- **Theme**: 推荐使用 `src/config/theme.ts` 中的颜色和度量变量。

## 5. 文本引擎 (Text Engine)

TNL 实现了一套基于 Canvas 的富文本排版引擎，位于 `src/core/draw.text.ts`。

### 核心能力
- **RichTextSpan**: 支持多样式文本片段（颜色、字体、粗体、斜体、下划线）。
- **Layout**: 支持自动换行（Word Wrap）、字符级换行（Grapheme Split）、对齐（Start/Center/End）。
- **Caching**: 内置 LRU Cache 用于 `measureText` 和 `fontMetrics`，大幅减少 Canvas API 调用开销。

### 使用方法
```typescript
const block = createRichTextBlock([
  { text: "Hello ", color: "red", emphasis: { bold: true } },
  { text: "World", color: "blue" }
], baseStyle, { wrap: "word" });

// 测量
const size = block.measure(ctx, maxWidth);
// 绘制
block.draw(ctx, { x: 0, y: 0 });
```

## 6. 事件系统 (Event System)

UI 系统封装了原生的 PointerEvent 和 WheelEvent，提供了更易用的事件对象。

### PointerUIEvent
- **属性**: `x`, `y` (相对于 Canvas), `button`, `buttons`, 修饰键 (ctrl/shift/alt/meta)。
- **Capture**: `e.capture()` 方法允许元素捕获指针。一旦捕获，后续的 Move/Up 事件将专有地发送给该元素，直到松开或失去捕获。这对于实现拖拽（Slider, Scrollbar, Window Drag）至关重要。

### WheelUIEvent
- **属性**: `deltaX`, `deltaY`, `deltaZ`。系统会自动标准化滚轮增量（处理 Pixel 与 Line 模式的差异）。
- **Handle**: `e.handle()` 标记事件已被处理，阻止默认行为（如浏览器滚动）。

## 7. 布局模式 (Layout Patterns)

TNL UI 不使用 Flexbox 或 Grid 布局引擎，而是采用 **父级驱动 (Parent-Driven)** 或 **约束布局** 的模式。

1.  **自上而下**: 父容器决定子元素的位置和大小 (`rect`)。
2.  **函数式属性**: 许多组件接受 `() => Rect` 而不是静态 `Rect`。这使得在父容器 resize 时，子元素能自动重新计算布局（只要父容器触发重绘）。
3.  **示例**:
    - `DividerSurface`: 根据分割线位置比例，动态计算左右两个 Viewport 的 `rect`。
    - `TabPanelSurface`: 顶部固定高度 TabBar，剩余空间全部分配给 Content Viewport。

## 8. 控件实现指南 (Widget Implementation)

编写新控件通常涉及继承 `UIElement` 并实现交互逻辑。以下以 `Scrollbar` 为例进行说明。

### 8.1 基本结构
```typescript
export class MyWidget extends UIElement {
  // 1. 定义依赖的数据源 (通常是 Signals 或 Getter)
  private readonly value: () => number
  
  constructor(opts: { value: () => number }) {
    super()
    this.value = opts.value
  }

  // 2. 必须实现 bounds()
  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 20 }
  }

  // 3. 实现绘制
  protected onDraw(ctx: CanvasRenderingContext2D) {
    // 使用 draw() 辅助函数
    draw(ctx, Rect(this.bounds(), { fill: { color: "red" } }))
  }
}
```

### 8.2 交互处理
实现 `onPointer*` 方法。注意使用 `e.capture()` 来处理拖拽。

```typescript
  onPointerDown(e: PointerUIEvent) {
    if (pointInRect({ x: e.x, y: e.y }, this.thumbRect())) {
      this.dragging = true
      e.capture() // 捕获指针，后续 Move/Up 事件将发送给此元素，即使鼠标移出范围
      this.lastPos = e.y
    }
  }

  onPointerMove(e: PointerUIEvent) {
    if (this.dragging) {
      const delta = e.y - this.lastPos
      // 更新状态...
    }
  }
```

### 8.3 完整示例: Scrollbar
参考 `src/ui/widgets/scrollbar.ts`。
- **Metrics 计算**: 分离布局逻辑到 `metrics()` 方法，根据 Viewport/Content 尺寸计算滑块位置。
- **交互**: 处理点击轨道跳转和拖拽滑块。
- **视觉**: 使用 `RRect` 绘制圆角滑块，根据 Hover/Down 状态改变颜色。

## 9. 关键 API 索引

### `src/ui/base/ui.ts`
- `pointInRect(p, r)`: 几何判定。
- `UIElement.draw(ctx, rt)`: 递归绘制入口。

### `src/ui/base/viewport.ts`
- `ViewportContext`: `{ rect, contentRect, scroll, toSurface(p), dpr }`。
- `Surface`: 定义内容的接口。

### `src/core/draw.ts`
- `draw(ctx, ...ops)`: 统一绘图入口。

### `src/core/rect.ts`
- `unionRect(a, b)`: 合并矩形（常用于脏矩形更新）。
- `inflateRect(r, pad)`: 扩大矩形。

## 10. 最佳实践

1.  **最小化脏矩形**: 在交互（如 Hover 状态改变）时，只 `invalidateRect` 发生变化的区域（通常是 `union(oldBounds, newBounds)`）。
2.  **避免布局抖动**: 在 `onDraw` 中尽量避免昂贵的布局计算，最好在状态变更时预计算或使用缓存。
3.  **使用 Theme**: 不要硬编码颜色值，使用 `theme.colors.*` 以支持统一换肤。
4.  **Signal 驱动**: 传入控件的 Props 最好是 Getter 函数或 Signal，这样控件无需手动更新，父组件状态变更时，控件在下一帧重绘时自动获取最新值。

## 11. OPFS 文件系统 (Origin Private File System)

TNL 提供了完整的 OPFS 文件系统支持，位于 `src/core/opfs.ts`。这是一个基于浏览器原生文件系统的高性能存储解决方案。

### 核心特性
- **原子性操作**: 所有文件操作都是原子的，防止数据损坏
- **JSON 元数据数据库**: 维护文件元数据，包括大小、类型、创建时间等
- **使用统计**: 实时跟踪存储使用情况和配额信息
- **错误处理**: 完善的错误类型系统，便于调试和用户反馈

### 基本用法
```typescript
import { openOpfs } from "src/core/opfs"

// 获取文件系统实例
const fs = await openOpfs()

// 写入文件
await fs.writeFile("videos/clip1.mp4", videoBlob, {
  type: "video/mp4",
  extras: { duration: 120, resolution: "1920x1080" }
})

// 读取文件
const blob = await fs.readFile("videos/clip1.mp4")

// 获取使用统计
const usage = await fs.getUsage()
console.log(`已使用: ${usage.bytes} 字节，共 ${usage.entries} 个文件`)
```

### 高级功能
- **批量操作**: 支持批量导入/导出文件
- **虚拟文件系统**: 支持文件夹结构和路径导航
- **数据完整性**: 可选的校验和验证

## 12. 信号调试系统 (Signal Debugging)

TNL 内置了强大的信号调试系统，帮助开发者追踪和理解响应式数据流。

### DevTools 集成
在开发者工具中，可以通过以下方式访问信号信息：
```typescript
// 在浏览器控制台中
const signals = window.__TNL_DEVTOOLS__.reactivity.listSignals()
console.table(signals)
```

### 信号元数据
可以为信号添加描述性元数据：
```typescript
import { signal, setSignalMeta } from "src/core/reactivity"

const count = signal(0)
setSignalMeta(count, {
  name: "videoCount",
  scope: "project.media"
})
```

### 调试面板功能
- **实时值监控**: 查看所有信号的当前值
- **依赖关系**: 跟踪信号之间的依赖关系
- **性能分析**: 监控信号更新的频率和影响范围
- **作用域分组**: 按功能模块组织信号

## 13. 高级组件示例

### Row 组件 (列表项)
`src/ui/widgets/row.ts` 提供了标准化的列表项组件：
```typescript
const row = new Row()
row.set({
  rect: { x: 0, y: 0, w: 300, h: 32 },
  leftText: "视频文件.mp4",
  rightText: "125.3 MB",
  variant: "item",
  selected: false
}, () => {
  console.log("Row clicked")
})
```

### 虚拟滚动 (Virtual Scrolling)
对于大量数据，使用虚拟滚动提升性能：
```typescript
// 在 StoragePanel 中实现
private visibleRows = signal<OpfsEntryV1[]>([])
private scrollTop = signal(0)

// 根据滚动位置计算可见项
private updateVisibleRows() {
  const itemHeight = 32
  const viewportHeight = this.bounds().h
  const startIndex = Math.floor(this.scrollTop.get() / itemHeight)
  const endIndex = Math.ceil((this.scrollTop.get() + viewportHeight) / itemHeight)
  
  const visible = this.allEntries.get().slice(startIndex, endIndex + 1)
  this.visibleRows.set(visible)
}
```

## 14. 性能优化技巧

### 1. 离屏渲染 (Offscreen Rendering)
使用 Compositor 进行离屏渲染：
```typescript
// 缓存静态内容
compositor.withLayer("static-content", width, height, dpr, (ctx) => {
  // 绘制复杂但不变的内容
  drawComplexBackground(ctx)
})

// 在主画布上合成
compositor.blit("static-content", destRect)
```

### 2. 文本测量缓存
文本引擎内置了 LRU 缓存：
```typescript
// 自动缓存文本测量结果
const metrics = measureText(ctx, text, style)
// 相同文本和样式的后续调用将使用缓存
```

### 3. 批量无效化
避免频繁的单个无效化：
```typescript
// 不好的做法
items.forEach(item => invalidateRect(item.bounds))

// 好的做法 - 批量无效化
const totalBounds = items.reduce(unionRect, items[0].bounds)
invalidateRect(totalBounds)
```

### 4. 事件委托
利用事件冒泡减少监听器数量：
```typescript
// 在父容器处理所有子项的点击
onPointerDown(e: PointerUIEvent) {
  const child = this.hitTest(e)
  if (child) {
    // 处理子项点击
  }
}
```

## 15. 调试和开发工具

### 内置调试功能
- **脏矩形可视化**: 在开发模式下显示重绘区域
- **性能监控**: 跟踪帧率和渲染时间
- **内存使用**: 监控 Canvas 和离屏缓冲区的内存占用

### 浏览器 DevTools 集成
```typescript
// 在控制台中调试信号
window.__TNL_DEVTOOLS__.reactivity.listSignals()

// 监控特定信号
const signal = window.__TNL_DEVTOOLS__.reactivity.findSignal(id)
console.log(signal.peek())
```

### 常见调试技巧
1. **使用 requestAnimationFrame 调试**: 确保动画在正确的时机更新
2. **检查坐标转换**: 使用 `ViewportContext.toSurface()` 验证坐标
3. **验证事件捕获**: 确保拖拽操作正确捕获指针
4. **内存泄漏检查**: 定期清理未使用的离屏缓冲区
