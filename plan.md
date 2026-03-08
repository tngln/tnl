project: tnl (Tung's Non-Linear Editor)
mode: plan
target: Chromium (PC/Mac), Canvas UI, no framework

---

# 目标与范围

- 产品定位：专业向的轻量级非编与合成工具，类 Premiere/Vegas 的工作流；不做 CapCut 式新手向引导。
- 运行环境：PC/Mac 下 Chromium-based 浏览器；依赖 WebCodecs 等现代能力。
- UI 形态：完全 Canvas-based（含文本、图标、布局、交互），不引入前端框架。
- 典型用例：屏幕录制剪辑、解说视频合成、简单非编工程、简单 Motion Graphics。
- 非目标：移动端、非 Chromium 兼容、复杂特效/3D、模板生态、协作/云端渲染。

# 当前判断

项目已经不再处于“只有底层实验”的阶段。Canvas UI 基建已经成形，窗口系统、Builder/JSX、函数式 Surface、样式继承、Developer 面板骨架、Timeline 核心组件都已落地。

当前主线应从“继续打磨通用 UI 基建”切换为：

1. 用现有 UI 基建承载真实编辑器数据模型。
2. 让 Timeline 从“可滚动/可缩放的展示组件”升级为“可操作的编辑器核心组件”。
3. 再打通媒体导入、解码、预览与导出链路。

这意味着后续工作不应再分散在大量新的 UI 抽象上，除非它直接服务于 Timeline、Inspector、媒体链路或主工作台组装。

# 核心原则

- 时间轴与媒体链路优先：Timeline 不再只是 demo，而是后续编辑交互和业务模型的宿主。
- UI 基建以“够用并稳定”为准：高层页面默认使用现有 `SurfaceWindow + defineSurface + JSX + Builder`，不再轻易扩张新范式。
- 每个阶段都应形成可运行闭环：导入、查看、滚动、缩放、选择、播放、导出逐步串起来。
- 性能优先：继续依赖 dirty rect、clip、compositor、局部重绘，避免回到全量 DOM/全量 Canvas 思路。
- 可靠性优先：明确状态、命令、媒体资源和文件句柄的生命周期。

# 阶段性路线图（当前版本）

## Phase 0：Canvas UI 基础设施（已完成）

这一阶段已经完成，并且完成度高于最初计划。

### 核心渲染与状态
- Bun + TypeScript 项目初始化。
- High-DPI Canvas 主循环。
- Signal / Effect 响应式系统。
- DevTools 可读的全局 signal 注册表。
- Dirty rect 与 `invalidateRect()`。
- `Compositor` 与离屏图层混合。

### Surface / Viewport / Window
- `Surface` / `ViewportElement` 架构。
- pointer / wheel 路由与 local 坐标转换。
- `ModalWindow` 多窗口、拖拽、缩放、最小化。
- `SurfaceWindow` 与标准 body host，窗口 body 已不再依赖手工 `translate + render`。
- `ToolDialog` 形态的无边框工具窗。

### Layout / Text / Widgets
- `core/layout.ts` 已实现并被 Builder 消费：
  - `row` / `column` / `stack`
  - `padding` / `inset` / `margin`
  - `gap` / `rowGap` / `columnGap`
  - `grow` / `shrink` / `basis`
  - `fixed` / `fill`
  - `position: "flow" | "overlay"`
  - `measureLayout(...)`
- 富文本引擎已实现：
  - `RichTextSpan`
  - `layoutRichText`
  - `drawRichText`
  - `createRichTextBlock`
  - 文本测量 LRU cache
- 基础控件已落地：
  - `Button`
  - `Checkbox`
  - `Radio`
  - `Label`
  - `Paragraph`
  - `Row`
  - `Scrollbar`
- `Button` / `Checkbox` / `Radio` 已支持真正的 `disabled` 语义。

### 高层 UI Authoring
- Builder engine 已落地。
- JSX / TSX 已接入自定义 `createElement`。
- `defineSurface(setup)` / `mountSurface(...)` 已实现。
- Builder 树已支持有限的级联样式继承：
  - `provideStyle`
  - `styleOverride`
- 高层页面骨架组件已形成：
  - `PanelColumn`
  - `PanelHeader`
  - `PanelActionRow`
  - `PanelScroll`
  - `PanelSection`

### Developer Tools
- `DeveloperToolsWindow` 已重构为模块化 tab 窗口。
- Timeline tab 已移除。
- 当前有效面板：
  - Data
  - Storage
  - Control
  - WM
  - Worker
  - Codec
  - Surface
  - Inspector
- 已落地面板：
  - Data：真实 state tree
  - Storage：真实 OPFS 管理
  - Control：控件与交互测试
- 其余说明型面板已迁到 Builder / JSX / 函数式 Surface。

## Phase 1：Timeline 核心与编辑器数据模型（进行中）

这一阶段当前只完成了前半段：Timeline 核心 UI 已经可用，但编辑器真实数据模型与交互还没有接上。

### 已完成

#### Timeline 核心 UI
- 独立 `TimelineToolWindow` 已落地。
- `TimelineCompositeSurface` 已实现。
- 内部 4 个核心 surface 已分离：
  - `TimelineRulerSurface`
  - `TimelineContainerBackgroundSurface`
  - `TimelineTrackHeaderSurface`
  - `TimelineTrackContentSurface`
- 已支持：
  - 横向滚动
  - 纵向滚动
  - 水平/垂直滚动条
  - `Ctrl` / `Meta` + wheel 缩放
  - pointer anchor 缩放
  - fixed header 与滚动内容分离
  - demo model 与 unit adapter

#### 滚动与视口验证
- `TabPanelSurface` 已支持滚动条与 wheel 滚动。
- `ToolsDialog` 已提供滚动示例页。
- Timeline 的 ruler / content / header 偏移、缩放和 wheel 路由问题已修复。

### 未完成

- 真实工程模型：
  - `Project`
  - `Sequence`
  - `Track`
  - `Clip`
- Timeline 与真实数据模型的映射。
- 播放头（playhead）。
- item 命中与选中态。
- item 拖拽移动 / trim / snap。
- Undo / Redo 命令系统。
- Timeline 与 Inspector / Data / Preview 的业务联动。

### Phase 1 的下一步拆分

#### 1A：编辑器数据模型
- 定义核心业务模型：
  - `Project`
  - `Sequence`
  - `Track`
  - `Clip`
  - 基础 selection 模型
- 接入 signal 系统。
- 让 `Data` 面板能真实展示编辑器状态，而不只是通用 state tree。

#### 1B：Timeline 交互第一轮
- 为 Timeline 增加：
  - playhead
  - 点击定位
  - item hit test
  - item selection
- 保持当前 Timeline UI 架构不变，只向其注入真实 view model。

#### 1C：命令系统最小闭环
- 建立 command pattern：
  - select item
  - move clip
  - trim clip
- 接入 Undo / Redo。

Phase 1 完成标准：
- 浏览器内可以打开一个真实 sequence。
- Timeline 显示真实 tracks / clips。
- 用户可以点击片段并改变 selection。
- playhead 可以定位。
- 至少一类编辑操作可撤销/重做。

## Phase 2：媒体导入、存储与解码链路

这一阶段的目标是让 timeline 上的数据不再只是静态 demo，而是来源于真实媒体。

### 已完成的前置条件
- OPFS 基础设施已可用。
- `Storage` 面板已经可以浏览、上传、下载、删除和编辑元数据。

### 下一步工作
- 基于 OPFS 完成媒体导入入口。
- 解析媒体元数据。
- 定义 `MediaAsset` / `Source` 层。
- 接入 `VideoDecoder` / `AudioDecoder`。
- 建立基础缓存与后台任务模型。

### 与 DevTools 的联动
- `Storage` 面板继续作为资产和文件层调试入口。
- `Codec` 面板开始展示真实解码器状态。
- `Worker` 面板开始展示后台任务和进度。

Phase 2 完成标准：
- 用户可以导入媒体文件。
- 工程模型中出现真实素材资产。
- 至少能请求并获取一段 clip 对应的视频帧或音频数据。

## Phase 3：预览渲染与播放

目标是从“时间轴数据存在”推进到“能预览播放”。

### 工作项
- `PreviewSurface`
- 与时间轴同步的渲染主时钟
- 视频帧上传与合成
- 音视频同步
- 简单播放控制（播放 / 暂停 / 定位）

### DevTools 联动
- `Surface` 面板查看 layer tree / draw ops
- `Codec` 面板查看缓冲与解码状态
- `WM` 面板查看窗口与预览实例状态

Phase 3 完成标准：
- 选中 sequence 后可以在预览窗口看到正确画面。
- playhead 与预览时钟同步。
- 至少支持基本播放与暂停。

## Phase 4：编辑器工作台组装

目标是把时间轴、预览、资源区、属性区拼成真正的非编工作台。

### 工作项
- 主工作台布局
- Timeline / Preview / Browser / Inspector 协同
- 片段拖拽、trim、snap、多选
- 属性编辑
- 选择态联动

### 约束
- 高层界面继续优先使用现有 Builder / JSX / SurfaceWindow。
- Timeline、Preview、Compositor 调试等复杂核心区继续保留专用 surface。

Phase 4 完成标准：
- 浏览器中形成完整的非编工作台。
- 用户可以导入素材、放入时间轴、进行基础剪辑并实时预览。

## Phase 5：导出与交付

### 工作项
- `VideoEncoder` / `AudioEncoder`
- Mux
- 后台导出任务
- 导出设置与结果回显

Phase 5 完成标准：
- 用户可以把当前 sequence 导出为可播放文件。

# 当前最近优先级

接下来 2-3 个迭代应严格按以下顺序推进：

1. 定义真实编辑器数据模型，并接入 signal。
2. 用真实模型替换 Timeline demo model。
3. 给 Timeline 增加 playhead、selection、点击定位。
4. 落地最小命令系统（Undo / Redo）。
5. 再进入媒体导入和解码链路。

不应优先做的事情：
- 再继续扩张通用 UI 抽象层。
- 过早做完整窗口 JSX 化。
- 过早重写 Timeline 为 Builder。
- 在没有真实工程模型前做大量高级剪辑交互。

# 风险与缓解

## 1. UI 基建继续膨胀
- 风险：继续沉迷于高层 UI 语法和抽象，会拖慢编辑器核心进度。
- 缓解：新增 UI 基建必须直接服务于 Timeline、Preview、Inspector 或媒体链路。

## 2. Timeline 业务模型与 UI 模型脱节
- 风险：Timeline demo model 与未来真实 sequence 模型不兼容，导致二次重写。
- 缓解：下一步优先把 Timeline view model 作为业务模型的映射层，而不是继续扩 demo 数据。

## 3. WebCodecs / 媒体资源生命周期复杂
- 风险：真实解码接入后，VideoFrame 生命周期、缓存与线程边界复杂度骤增。
- 缓解：在 Phase 2 先做最小链路与清晰的资源管理边界，再扩性能优化。

## 4. Canvas 性能瓶颈
- 风险：随着 Preview 和 Timeline 复杂度增长，2D 渲染可能受限。
- 缓解：继续保持 Surface / Compositor / Timeline 坐标体系的清晰分层，必要时为 Preview 渲染后端切 WebGL / WebGPU。
