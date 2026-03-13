## Plan: Window Chrome 组件化重构

**核心思路**：`ModalWindow` 变成纯协调器——持有信号和业务方法；所有绘图和交互下沉到各自的 `UIElement` 子类。`layout.ts` 从窗口列布局到标题栏按钮行串联整个几何计算。

---

**新文件结构**（`src/ui/window/`）

| 文件 | 内容 |
|------|------|
| `window_layout.ts` (新) | `computeWindowLayout()` — 纯函数，用 `layout.ts` 计算所有 rect |
| `window_frame.ts` (新) | `WindowFrame` — 背景 rect + 阴影 + 边框 |
| `title_bar.ts` (新) | `TitleBar` / `TitleBarText` / `TitleBarDragZone` |
| `title_bar_buttons.ts` (新) | `TitleBarBtn`(基类) / `CloseButton` / `MaximizeButton` / `MinimizeButton` |
| `window_body.ts` (新) | `WindowBody` — 包含内部 `ViewportElement` |
| `resize_handle.ts` (新) | `ResizeHandle` — 原样移出 |
| `window.ts` (改) | `ModalWindow` 瘦身，保留全部公开 API 不变 |

---

**UIElement 树**

```
ModalWindow
  ├── WindowFrame     (z=0)   — 背景+阴影+边框 RectOp
  ├── TitleBar        (z=1)   — 标题栏底色(default chrome)+分割线
  │     ├── TitleBarText      (z=0)   — 只绘制，无指针事件
  │     ├── TitleBarDragZone  (z=1)   — 覆盖整个标题栏；FSM 处理拖拽
  │     ├── CloseButton       (z=100)
  │     ├── MaximizeButton    (z=100) — 仅 resizable + default chrome
  │     └── MinimizeButton    (z=100) — 仅 minimizable
  ├── WindowBody      (z=2)   — body rect；内含 ViewportElement 子节点
  └── ResizeHandle    (z=100) — 右下角缩放
```

按钮因 z=100 自然赢得 hitTest，`TitleBarDragZone`（z=1）覆盖其余标题栏区域，无需手动排除按钮区。

---

**Phase 1 — `window_layout.ts`**

`computeWindowLayout(params: WindowLayoutParams): WindowLayoutResult`

用两次 `layout()` 调用：

1. **列布局**（整窗口）：
   - `titleBarNode { fixed: titleBarH }` → `titleBar` rect
   - `bodyNode { fill: true }` → `body` rect

2. **行布局**（标题栏内部）：
   - padding: `{ l: theme.spacing.sm, t: pad, r: pad, b: pad }`（pad 根据 chrome 类型取值）
   - `titleTextNode { fill: true }` → `titleText` rect
   - `buttonRowNode { axis: "row", gap: 2, children: [minimize?, maximize?, close] }` → `buttonRow` + 各按钮 rect

返回 `{ frame, titleBar, body, titleText, buttonRow, closeButton, maximizeButton, minimizeButton }` 一次性对象。

---

**Phase 2 — `TitleBarDragZone` FSM**

```
States: "idle" | "pressed" | "dragging"

idle   + PRESS              → pressed   (store originPointer, capture)
pressed + MOVE [超过阈值]   → dragging  (effect: 启动拖拽或从最大化还原)
pressed + RELEASE           → idle      (effect: 单击/双击检测 → toggleMaximize)
pressed + CANCEL            → idle
dragging + MOVE             → dragging  (effect: 更新 win.x/y，fireTitleDragMove)
dragging + RELEASE          → idle      (effect: fireTitleDragEnd)
dragging + CANCEL           → idle      (effect: fireTitleDragCancel)
```

`bounds()` = 完整 titleBar rect（被更高 z 的按钮遮挡部分让给按钮，其余区域拦截）。

---

**Phase 3 — `ModalWindow` 瘦身**

删除：`onDraw()` / `isInTitleBar()` / `titleInteraction` 状态对象 / `drawBody()` / `bodyRect` 字段 / `TitleBarButton*` 类 / `titleButtonRect()` 函数。

增加包内方法（`_` 前缀）供子组件回调：

```ts
_getLayout()          → WindowLayoutResult
_onStateChanged()
_onTitleDragStart/Move/End/Cancel(pointer)
_startDragOrRestore(pointer, origin): dragOffset  // 封装 anchored-restore 逻辑
_handleTitleClick(point)                          // 双击检测 + toggleMaximize
```

**所有公开 API 不变**：`openWindow`, `closeWindow`, `minimize`, `restore`, `maximize`, `setBodySurface`, `bounds()`, `snapshot()`, `setHooks()`, `setDragHooks()`, `setWindowRect()`, `setMinimizedRect()`, `setMaximizeBounds()`, `constrainToCanvas()`。

import 路径保持不变 (`@/ui/window/window`)。

---

**验证步骤**

1. `bunx tsc -p tsconfig.json --noEmit` → 通过
2. 现有测试（`window_manager.test.ts`）全部通过
3. 手动验证：拖拽、双击最大化、最小化还原、关闭、缩放
4. 所有 dialog / tool window (`SurfaceWindow` 子类) 的 `setBodySurface` 正常工作

---

**待决策**

- `drawBody()` 已删除。目前 `window.ts` 中还没有空 body 的使用者（所有 `SurfaceWindow` 都会设置 body），你认为是否需要保留一个空 body 状态（比如 loading placeholder）？
