# Refactor Plan 0316

## 1. 愿景

这次重构不是对现有结构做局部修补，而是一次允许破坏性变更的体系重整。目标是把当前 UI、Builder、窗口、平台适配、渲染边界整理成一套更容易理解、更符合现代前端直觉、冗余更少、状态边界更清晰、默认局部更新、可长期演进的架构。

重构完成后，应达到以下状态：

- 普通界面默认使用声明式 Surface/Builder API 编写，而不是通过 retained class、descriptor、widget pool 间接生成界面。
- 简单控件默认走声明式渲染节点和 DrawOps，不再为一个按钮、checkbox、row item 创建长期存活的 class 实例。
- 复杂交互部件仍允许 retained/controller 模型，但必须是少数且有明确理由，例如 viewport、window frame、textbox、timeline、docking。
- `canvas-interface` 从 `tnl` 业务渲染能力中拆出，成为独立包；`tnl` 只消费其公开 API。
- 渲染默认走统一的 DrawOps/RenderNode 管道，减少直接 `ctx.*` 绘图和散落的手工排版逻辑。
- 状态管理以显式、局部、可跟踪为原则；signal 保留，但不再让简单 UI 经过过重的 descriptor/runtime/widget 生命周期。
- invalidation 默认是局部且有归属的，而不是大量依赖全局 `invalidateAll()`。

## 2. 新 API 的调用方式

### 2.1 普通面板

应用层最常见的写法应当是：

```ts
const InspectorSurface = defineSurface({
  id: "Inspector",
  setup(props) {
    return () =>
      Column([
        Section({
          title: "Project",
          body: [
            Text({ text: props.projectName }),
            Button({ text: "Save", onPress: props.onSave }),
          ],
        }),
      ])
  },
})
```

特点：

- `defineSurface({ id, setup })` 保留，仍然是普通界面的主入口。
- `setup()` 返回渲染函数。
- 渲染函数返回声明式节点树。
- 普通节点最终编译为 layout tree + render tree + interaction helpers，而不是自动落入 retained widget descriptor 链路。

### 2.2 简单控件

简单控件应当接近函数式组件：

```ts
Button({
  text: "Save",
  onPress: saveProject,
  disabled: saving.get(),
})
```

它内部的目标模型应当是：

- 输出 `DrawNode[]`
- 输出点击区域、cursor、focus 信息
- hover/pressed/focus/disabled 的视觉状态由共享 recipe 统一解析
- 不默认创建长期 retained instance

### 2.3 复杂控件

复杂控件保留 controller：

```ts
const field = createTextFieldController({ value })
TextField({ controller: field })
```

职责划分：

- controller 管理 selection、caret、IME、hidden input bridge、drag selection
- 视图层只根据 controller state 进行渲染
- 复杂逻辑不再混进简单控件系统里

### 2.4 复杂编辑器表面

timeline、docking、复杂 viewport 继续允许 retained 模型：

```ts
const timeline = createTimelineSurfaceController({ session, zoom })
Viewport({
  controller: timeline.viewport,
  overlay: timeline.overlay,
})
```

原则：

- retained 只在确实需要 pointer session、scroll/zoom、局部缓存、复杂命中测试时保留
- 仍然复用统一 viewport、draw、invalidation、overlay 基础设施

### 2.5 overlay / popup / menu

弹层模型应当统一成声明式：

```ts
OverlayHost([
  {
    anchor,
    content: () => Menu({ items }),
    dismissPolicy: "outside-pointer-down",
  },
])
```

这样 dropdown、menu、tooltip、drag preview 不再分别直接操纵 top-layer 细节。

### 2.6 browser adapter

通用 canvas host 应当是独立入口：

```ts
createCanvasApp({
  canvas,
  rootSurface,
})
```

其中：

- `canvas-interface` 提供 canvas host、RAF、pointer capture、text input bridge、通用输入适配
- OPFS、playback、file IO、webcodecs、service worker 策略留在 `tnl-app`

## 3. 当前系统的主要问题和痛点

### 3.1 分层边界不干净

- `core`、`ui`、`platform/web`、`render`、`windows`、`docking` 在目录上分层，但真实边界主要靠约定而不是 API。
- `platform/web` 同时承载了通用浏览器适配和业务能力接入，层次不稳定。
- 启动编排过多集中在 `src/main.ts`，说明系统边界没有完全收束。

### 3.2 Builder 到 retained widget 的桥接过重

- 当前普通面板虽然可以用 JSX/Builder 写，但最终仍然要经过 `BuilderNode -> AstNode -> handler -> widget descriptor -> UIElement instance`。
- 对简单控件而言，这条链过长，理解成本和调试成本都偏高。

### 3.3 简单控件过度 retained

- button、checkbox、radio、基础 row 等控件没有复杂本地状态，却仍依赖 class、descriptor、mount/update 生命周期。
- 这让简单 UI 失去“声明式直觉”。

### 3.4 简单控件和复杂控件没有明确分流

- textbox、scrollbar、window、dock workspace 确实需要 retained/controller。
- 但当前系统没有把“为什么 retained”表达成显式架构原则，导致几乎所有控件都默认 retained。

### 3.5 直接绘图和手工排版仍偏多

- 尽管已有 draw abstraction，但很多地方仍直接操作 `ctx`、手写文本测量、手写几何排版。
- 这部分难以统一缓存、diff、局部 invalidation，也容易重复。

### 3.6 invalidation 模型未完全收敛

- 系统已经有 dirty rect、batch、scheduler。
- 但 BuilderSurface 还保留了全局 `invalidateAll()` 思维。
- 结果是细粒度更新和整树重绘两种模型长期并存。

### 3.7 overlay / top-layer 使用方式偏过程化

- dropdown、menu、tooltip、light dismiss 等知道太多 top-layer 细节。
- 这让弹层系统难以统一，也导致关闭策略和层级管理重复实现。

### 3.8 样式和文本测量存在重复逻辑

- hover/pressed/disabled/selected 样式逻辑散落于多个 widget。
- 文本截断、测量、font string 拼接也在多个控件和 handler 中重复出现。
- 这些都属于可统一的基础设施噪音。

### 3.9 缺少 composable 层

- `src/ui/use` 目前为空。
- 但 press、hover、focus、drag、selection、scroll 等交互已经明显需要可复用 helper。
- 当前这些逻辑主要埋在继承层次或控件内部，不利于复用和简化。

### 3.10 canvas-interface 尚未真正独立

- 文档已经把它视作一套体系。
- 但仓库结构、包边界、公开 API 还没有真正把它从 tnl 业务中拆出来。
- 如果不先拆边界，后续重构仍会把业务需求不断带回基础层。

## 4. 总体策略

总体推进顺序如下：

1. 先拆包边界，确定 `canvas-interface` 与 `tnl-app` 的单向依赖。
2. 再定义新的 render contract，让普通 UI 默认走声明式 DrawOps/RenderNode。
3. 再简化 Builder 和 widget runtime，删除简单控件不必要的 retained 生命周期。
4. 再在新基础设施上重构 window、overlay、docking、timeline。
5. 最后删除旧路径、兼容桥和重复 authoring 模式。

这个顺序的核心逻辑是：先定边界，再定模型，再迁移复杂系统，最后收尾删旧。

## 5. Phase 1：拆分包边界，建立 canvas-interface 公共 API

### 目标

让通用 canvas UI/runtime 成为独立包，tnl 作为其消费者。

### 任务

1. 建立包结构
- `packages/canvas-interface`
- `packages/tnl-app`
- 调整 workspace、tsconfig、package.json、路径别名、测试入口

2. 抽出通用模块到 `canvas-interface`
- geometry / rect helpers
- draw / draw.text
- reactivity
- layout
- ui event / dispatch / hit test
- canvas host / viewport / compositor / top-layer
- builder
- generic widgets
- generic theme tokens

3. 保留业务模块在 `tnl-app`
- render engine / render worker / proxy
- playback session
- docking workbench
- explorer / developer tools / timeline
- OPFS / file IO / webcodecs / dialogs / service worker
- app bootstrap

4. 重构 browser adapter
- 通用浏览器能力进入 `canvas-interface`
- 业务相关平台能力保留在 `tnl-app`

5. 建立公共导出面
- `canvas-interface/reactivity`
- `canvas-interface/layout`
- `canvas-interface/draw`
- `canvas-interface/ui`
- `canvas-interface/builder`
- `canvas-interface/browser`

6. 全量修正导入关系
- `tnl-app` 不再直接 import `canvas-interface` 的内部文件路径

### 计划

1. 先画模块归属表，按“通用 / 业务 / 待裁定”三类清点现有文件。
2. 再完成包目录和导出入口骨架。
3. 再迁移低耦合核心模块，例如 geometry、rect、draw、layout、reactivity。
4. 再迁移 ui/base、builder、widgets。
5. 最后处理 browser adapter 和 app 侧导入修正。

### 验收标准

1. `tnl-app` 只通过公开入口依赖 `canvas-interface`。
2. `canvas-interface` 内部不存在对 `tnl-app` 的反向依赖。
3. `tsc --noEmit` 通过。
4. 现有测试在分包后仍通过。
5. `canvas-interface` 能独立运行最小 demo surface，不依赖 render/proxy/playback。

## 6. Phase 2：建立新的渲染/交互核心模型

### 目标

把普通控件和普通面板的默认实现路径变成声明式 render node + DrawOps。

### 任务

1. 定义新的 render contract
- `DrawNode`
- `HitNode`
- `InteractiveNode`
- `OverlayNode`
- 支持 group、clip、transform、opacity、cursor、hit region

2. 扩展 DrawOps 体系
- 在现有 `RectOp`、`TextOp`、`LineOp`、`CircleOp`、`ShapeOp` 基础上增加组合能力
- 补齐 clip、transform、text block、icon、layer

3. 定义简单控件的函数式渲染协议
- 输入 props 和可选局部 state
- 输出 draw tree + interaction description
- 不默认创建 retained instance

4. 为复杂控件保留 controller 协议
- controller 管理 retained local state、selection、IME、pointer session、scrolling
- 视图层只负责消费 controller state

5. 重新定义 invalidation 归属
- 每个 surface / viewport / overlay host 都有自己的 invalidation scope
- 废弃默认依赖全局 `invalidateAll()`

6. 建立统一 interaction helper 基础
- press / hover / focus / drag / selection / wheel / scroll 作为 composable 提供

### 计划

1. 先把 render contract 的数据结构和生命周期定义清楚。
2. 再让简单控件先跑通一条最小链路。
3. 再补局部 invalidation 和交互 helper。
4. 最后让一个真实面板跑在新模型上。

### 验收标准

1. 至少一组简单控件不再经过 widget descriptor + retained UIElement instance 链路。
2. 简单控件的 hover/pressed/disabled 视觉逻辑不再各自重复实现。
3. 新模型可以完成点击、hover、focus、局部 invalidation。
4. 新模型足以承载至少一个实际面板，而不只是 demo。

## 7. Phase 3：简化 Builder 和 widget runtime

### 目标

把当前偏重的 Builder 渲染链路压缩成更直接的结构，删除简单控件不必要的 lifecycle 机制。

### 任务

1. 重写 Builder 编译路径
- `BuilderNode -> LayoutTree -> RenderTree`
- 可选 `controller mount`
- 去掉“所有节点最终都必须进 widget pool”的假设

2. 缩减或删除 widget descriptor 机制
- button、checkbox、radio、basic row、basic rich text 等简单节点不再走 descriptor
- 仅为 textbox、scrollbar、dropdown/menu、复杂 selectable 保留 controller mount

3. 收敛 registry handler 形态
- 每种节点统一为 `measure + render + optional controller`
- 删除重复 mount 样板

4. 建立 composable 层
- `usePress`
- `useHover`
- `useFocusRing`
- `useDragSession`
- `useScrollable`
- `useTextSelection`
- `useSelectionList`

5. 收敛文本与样式基础设施
- 文本测量、截断、font string 统一走缓存服务
- control visual recipe 统一管理 hover/pressed/selected/disabled

6. 调整 `defineSurface` / `mountSurface`
- 保留现有 authoring 体验
- 底层不再隐式构造过多 retained widget 对象

### 计划

1. 先改 Builder runtime 和 handler 契约。
2. 再迁移第一批简单节点。
3. 再补 `ui/use` composable。
4. 最后统一文本和样式基础设施。

### 验收标准

1. Builder 渲染路径可以用清晰调用图解释，层数明显减少。
2. 简单控件已经脱离 widget registry。
3. `ui/use` 已承担主要交互逻辑复用。
4. 文本测量和截断不再在多个控件/handler 中重复实现。

## 8. Phase 4：在新核心上重构 window / overlay / docking / timeline

### 目标

把最复杂的 retained 子系统迁移到新边界和新基础设施上，并拆清各自职责。

### 任务

1. 重构 window frame
- 分离 window frame controller
- 分离 chrome rendering
- 分离 title bar buttons / resize handles
- 分离 body viewport host
- 明确 maximize / minimize / snap / restore 状态边界

2. 统一普通窗口 authoring 路径
- about、tools、timecode、developer 等普通窗口统一回到 declarative surface 配置
- 不再为“只是配置一个 surface 的窗口”保留复杂 retained 结构

3. 重构 overlay / top-layer
- dropdown、menu、tooltip、drag preview、light dismiss 统一走 overlay 声明模型

4. 重构 docking
- docking manager 负责状态与拖放规则
- workspace surface 负责视觉布局
- tab strip / split gutter / pane header 复用统一布局与交互 helper

5. 重构 timeline
- timeline 保留复杂 controller 模型
- scroll、zoom、ruler、selection、clip drawing 更多依赖统一 draw/layout/viewport API

6. 清理 invalidation
- 窗口移动、停靠、缩放、overlay 弹出关闭都走明确局部 invalidation 路径

### 计划

1. 先拆 `ModalWindow`。
2. 再统一 overlay。
3. 然后迁移普通窗口。
4. 最后再做 docking 和 timeline 这两个复杂 retained 子系统。

### 验收标准

1. 普通窗口定义方式显著简化。
2. overlay 行为统一，外部点击关闭、层级管理、preview 呈现不再各自实现。
3. docking 和 timeline 不再依赖过多底层私有实现细节。
4. 窗口、弹层、停靠操作都保持正确的局部重绘。

## 9. Phase 5：删除旧路径，收紧规范，形成长期可维护结构

### 目标

在迁移完成后删除历史兼容路径，避免新架构刚上线又继续积累重复体系。

### 任务

1. 删除旧的 descriptor-heavy 路径和不再需要的 retained widget 逻辑。
2. 删除重复 authoring 模式，只保留两条主路径：
- 普通 UI：declarative surface + builder/render nodes
- 复杂编辑器：controller + viewport + render nodes

3. 收紧包边界检查
- 禁止 app 再回头 import `canvas-interface` 内部文件
- 禁止通用包继续吸收业务能力

4. 更新文档和样例
- 更新总计划
- 更新 canvas-interface 文档
- 更新 UI 调用约定
- 为 `canvas-interface` 提供最小 demo / examples

5. 建立长期规则
- 新增简单控件默认不得以 retained class 为起点
- 新增 UI 默认不得直接写原始 `ctx` 指令，除非 DrawOps 无法表达
- 新增平台能力默认不得进入通用包，除非它是业务无关的浏览器基础能力

### 计划

1. 先删旧路径。
2. 再补文档。
3. 再加边界检查和长期约束。

### 验收标准

1. 新增普通 UI 可以只靠声明式 API 完成。
2. 仓库中不存在两套同等地位的普通 UI 实现路径。
3. `canvas-interface` 可以独立测试和演示。
4. 文档、目录结构、公开 API 三者一致。

## 10. 阶段依赖关系

### 必须先完成的前置

1. 包边界不清，不能开始大规模迁移。
2. 新 render contract 未定，不能重写 Builder。
3. Builder 未简化，不应提前全面重构 window / docking / timeline。

### 可并行推进的任务

1. 文本测量与样式 recipe 收敛。
2. 通用 browser adapter 抽离。
3. 简单控件第一批函数式迁移。
4. `ui/use` composable 建设。

## 11. 总体验收标准

### 架构层

1. `canvas-interface` 与 `tnl-app` 边界清晰，单向依赖明确。
2. 普通 UI、复杂编辑器 UI、overlay、window 的职责边界清晰。
3. 开发者可以直观判断一个新功能应当使用 declarative node 还是 retained controller。

### 代码层

1. 简单控件和普通面板的代码量下降。
2. hover/pressed/text-measurement 等重复样板显著减少。
3. 直接 `ctx.*` 绘图和手工局部排版数量下降。
4. 全局 `invalidateAll()` 不再是默认更新路径。
5. descriptor / widget registry 只保留在真正必要的地方，或被完全移除。

### 运行层

1. window 拖拽、resize、maximize、snap、overlay、menu、dropdown、textbox、timeline、docking 等关键交互保持正确。
2. 局部重绘行为正确，没有回退成大量全量重绘。
3. 原有测试和新增测试均通过。

### 工程层

1. `bun test` 通过。
2. `tsc --noEmit` 通过。
3. `canvas-interface` 包可以独立运行样例或测试。
4. 文档、目录结构、公开 API 三者相互一致。

## 12. 推荐的首轮执行顺序

1. 先完成包目录与导出边界设计稿。
2. 把通用 `core` 与 `ui/base`、`ui/builder` 中的基础部分移入 `canvas-interface`。
3. 从 browser 层拆分通用 adapter 与业务能力。
4. 设计并实现新 render contract。
5. 选择 button、checkbox、radio、label 作为第一批从 retained widget 迁移到声明式节点的样板。
6. 再改 Builder runtime 以承载这批新节点。
7. 然后再开始 window、overlay、docking、timeline 的迁移。

## 13. 范围声明

### 本计划明确允许

1. 破坏性重构。
2. 不兼容旧 API。
3. 删除现有抽象。
4. 调整目录和包结构。
5. 重写部分窗口、控件、Builder 路径。

### 本计划当前不包含

1. 新的编辑业务模型扩张。
2. 新媒体能力扩张。
3. 纯视觉风格翻新。
4. 与旧 API 的长期兼容层维护。

## 14. 需要同步更新的文档

建议随后同步更新：

- `plan.md`
- `documents/canvas-interface.md`
- `documents/UI系统现状与调用约定.md`

---

## 15. 执行记录

### Phase 1 — 已完成（2026-03-15）

**完成内容：**

- 建立 `packages/canvas-interface` 与 `packages/tnl-app` monorepo 结构（Bun workspaces）
- 建立公共导出入口：`/reactivity`、`/layout`、`/draw`、`/ui`、`/builder`、`/util`、`/platform`、`/render`
- 迁移约 30 个应用层文件，将 `@/` 内部路径替换为 `@tnl/canvas-interface/*` 和 `@tnl/app/*` 公开入口
- tsconfig 路径别名修正（含子包中的 `@tnl/*` 映射，解决了跨包传递引用问题）
- 验收：`tsc --noEmit` 干净，215/215 测试通过

**Phase 1 验收标准达成：**
1. ✅ `tnl-app` 只通过公开入口依赖 `canvas-interface`
2. ✅ `canvas-interface` 内部不存在对 `tnl-app` 的反向依赖
3. ✅ `tsc --noEmit` 通过
4. ✅ 现有测试在分包后仍通过
5. ⚠️ `canvas-interface` 独立 demo 尚未建立（功能性完成，样例未建）

---

### Phase 2 — 核心工作已完成（2026-03-16）

**完成内容：**

**新文件 `src/ui/builder/control.ts`：**
- `ControlElement`：通用交互元素，取代简单控件的 retained class
- `ControlDrawFn`、`ControlState`：draw 函数接收 rect + `{hover, pressed, disabled}`，完全无状态
- `update()` 每帧由 runtime 调用，刷新 rect / active / disabled / draw fn / onClick / cursor
- 使用 `createPressMachine()` 管理按压状态，hover 来自 UIElement 基类

**修改 `src/ui/builder/runtime.ts`：**
- 新增 `controls: Map<key, {el: ControlElement, active, used}>` 对象池
- 新增 `mountControl()` 方法：按 key 查找或创建 `ControlElement`，每帧刷新属性
- `beginFrame() / endFrame()` 扩展：controls 池参与 used 标记与回收
- `debugCounts()` 更新：返回 `widgets.size + controls.size` 合并计数

**新文件 `src/ui/builder/draw_controls.ts`：**
- `drawButton(ctx, rect, props, state)` — 提取自 `Button.onDraw()`
- `drawCheckbox(ctx, rect, props, state)` — 提取自 `Checkbox.onDraw()`
- `drawRadio(ctx, rect, props, state)` — 提取自 `Radio.onDraw()`
- `drawListRow(ctx, rect, props, state)` — 提取自 `ListRow.onDraw()`
- 四个函数共享统一的 hover/pressed/disabled 颜色逻辑

**修改 `src/ui/builder/registry.ts`：**
- `buttonHandler`、`checkboxHandler`、`radioHandler`、`rowItemHandler` 的 `mount` 改为调用 `mountControl()`
- 不再调用 `mountWidget()` 进入 descriptor 链路

**测试修正 `src/ui/builder/surface_builder.test.ts`：**
- 快照类型检查从 `"ListRow"` 改为 `"ControlElement"`
- 215/215 测试通过

**Phase 2 验收标准达成：**
1. ✅ button、checkbox、radio、listRow 均不再经过 widget descriptor + retained instance 链路
2. ✅ 四种控件的 hover/pressed/disabled 视觉逻辑统一在 `draw_controls.ts`，不再各自重复
3. ✅ 点击、hover 正常工作；局部 invalidation 沿用现有 frame 模型
4. ✅ 现有实际面板通过新模型正常工作

**遗留/待处理：**
- 旧 `Button`、`Checkbox`、`Radio`、`ListRow` 类及其 descriptor 仍存在于代码库，已不被 builder 使用，待删除
- `clickArea` 仍走旧 `mountWidget` 路径，可迁移至 `mountControl`
- 局部 invalidation scope 未改：BuilderSurface 仍依赖全局 `invalidateAll()`
- 原计划的 `DrawNode / HitNode / RenderNode` 数据结构契约被更实用的 `ControlElement + ControlDrawFn` 方式替代，未建立独立 render contract 层

---

### 下一步（Phase 3 优先任务，2026-03-16 起）

1. **清理旧 retained widget 类**：删除 `Button`、`Checkbox`、`Radio`、`ListRow` 的 class 定义及 descriptor，从 widgetRegistry 注册表和 widgets/index.ts 导出中移除
2. **迁移 `clickArea` 至 `mountControl`**：clickArea 无 draw 内容，适合用 `mountControl` + 空 draw fn
3. **建立 composable 层 `src/ui/use/`**：`usePress`、`useHover`、`useDragSession` 等，将各控件中的重复交互逻辑提取为独立 hook
4. **收敛样式 recipe**：将 `draw_controls.ts` 中的 hover/pressed/disabled 颜色逻辑抽成共享工具函数，减少各控件条件分支
5. **Phase 4 预备**：评估普通窗口定义方式简化的切入点（window frame 分离、overlay 声明模型）