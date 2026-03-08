project: tnl (Tung's Non-Linear Editor)
mode: plan
target: web-first runtime, Canvas UI, no framework

---

# 目标与范围

- 产品定位：专业向的轻量级非编与合成工具，工作流接近 Premiere / Vegas；不做 CapCut 式新手向导。
- 当前运行：以 Chromium-based 浏览器为主，依赖现代 Web 能力。
- 长期方向：保留迁移到原生 JavaScript runtime 的潜力；Canvas Interface、窗口系统、编解码与绘图能力需要逐步脱离对浏览器入口的散乱依赖。
- UI 形态：完全 Canvas-based，包含文本、图标、布局、交互；不引入前端框架。
- 非目标：移动端、复杂特效/3D、模板生态、协作/云端渲染。

# 当前判断

项目已经不再处于“底层可行性实验”阶段。当前 Canvas UI 基建已经能承载多窗口、滚动缩放、Builder/JSX、高层函数式 Surface、Developer 工具和独立 Timeline 窗口。

但主线暂时不应切到编辑器业务模型。原因不是 Timeline 或数据模型不重要，而是当前仍有一批关键基础设施没有完全收口：

1. 窗口管理刚完成正式化，但 `WindowManager` 仍未扩展到完整能力。
2. 浏览器运行时能力刚开始集中到 `src/platform/web`，边界还需要继续收紧。
3. Developer 面板里只有一部分已经接上真实 runtime 数据，仍缺少完整观测面。
4. 窗口与高层面板结构虽然已经大幅声明化，但还有重复模式尚未进一步压缩。

在这些基础未稳定之前，过早推进 `Project / Sequence / Track / Clip`、Timeline 业务交互和媒体链路，只会把平台绑定、窗口状态、调试接口和复杂交互耦合到错误位置。

因此，近期主线应明确为：

1. 继续完成 Canvas Interface 收口。
2. 完成 Window / Platform / Developer Runtime 三条线的边界固定。
3. 在此之后，再推进编辑器数据模型、Timeline 业务化与媒体链路。

# 核心原则

- 先收口，再扩业务：窗口管理、平台边界和调试观测先稳定，再接真实编辑器模型。
- 高层 UI 基建以“可复用且不过度设计”为准：默认沿用 `SurfaceWindow + defineSurface + JSX + Builder`，不新增宽泛抽象。
- 浏览器能力显式集中：运行时读取 `document` / `window` / `navigator` / WebCodecs / OPFS 的路径，应优先经 `src/platform/web` 进入。
- Timeline 保持核心定位，但暂不强推为第一优先级：它继续作为独立核心窗口存在，业务化顺延到平台边界收口之后。
- Developer 必须逐步从“说明性 demo”变成“运行时观测台”。

# 阶段性路线图（当前版本）

## Phase 0：Canvas UI 基础设施（已完成）

这一阶段已经完成，且完成度高于最初预期。

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
- `SurfaceWindow` 与标准 body host。
- 窗口 body 已不再依赖手工 `translate + render`。

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
  - `createRichTextBlock`
  - 文本测量 cache
- 基础控件已落地：
  - `Button`
  - `Checkbox`
  - `Radio`
  - `Label`
  - `Paragraph`
  - `Row`
  - `Scrollbar`
- `Button` / `Checkbox` / `Radio` 已支持真正的 `disabled`。

### 高层 UI Authoring
- Builder engine 已落地。
- JSX / TSX 已接入自定义 `createElement`。
- `defineSurface(setup)` / `mountSurface(...)` 已实现。
- Builder 树已支持有限的级联样式继承：
  - `provideStyle`
  - `styleOverride`
- 页面骨架组件已形成：
  - `PanelColumn`
  - `PanelHeader`
  - `PanelActionRow`
  - `PanelScroll`
  - `PanelSection`

## Phase 1：Canvas Interface 收口（进行中）

这一阶段是当前的主线。

### 已完成

#### 窗口系统正式化
- `WindowManager` 已落地。
- 窗口注册、快照、聚焦、z-order、最小化 tile 布局已从 `main.ts` / `Root` / `CanvasUI` 中收口。
- `WM` panel 已经消费真实窗口 API，而不再只是说明文本。

#### 平台边界初步建立
- `src/platform/web` 已建立，并按能力拆分为：
  - `app`
  - `animation`
  - `canvas`
  - `navigator`
  - `webcodecs`
  - `opfs`
  - `dialogs`
  - `file_io`
- 主路径已接入：
  - 应用入口
  - RAF / resize
  - DPR / 测量 canvas / layer canvas
  - OPFS root / storage estimate
  - Storage panel 的文件选择、下载、对话框
  - Codec panel 的 navigator / runtime / WebCodecs probe

#### Developer 页面重构
- `DeveloperToolsWindow` 已模块化。
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
- 已经具备真实行为或真实数据接入的面板：
  - Data
  - Storage
  - Control
  - WM
  - Codec

#### Timeline 核心 UI
- 独立 `TimelineToolWindow` 已落地。
- `TimelineCompositeSurface` 已实现。
- 已支持：
  - 横向滚动
  - 纵向滚动
  - 水平/垂直滚动条
  - `Ctrl` / `Meta` + wheel 缩放
  - pointer anchor 缩放
  - fixed header 与滚动内容分离
- Timeline 当前定位为独立核心 UI 组件，而不是 Developer tab。

### 未完成

#### WindowManager 仍未完全收口
- bulk actions
- active window 视觉高亮
- 边界约束统一策略
- 状态持久化 / workspace 雏形

#### 平台边界仍需继续收紧
- 剩余零散浏览器绑定点需要继续迁入 `src/platform/web`
- 现有 `src/platform/web` 仍是能力集中层，不是完整跨平台抽象，需要继续保持边界清晰

#### Developer runtime 观测面仍不完整
- `Worker` panel 仍缺少真实 worker registry / task 状态
- `Surface` panel 仍缺少 compositor / layer tree / draw stats
- `Inspector` panel 仍缺少真实选中对象或 runtime target
- `Codec` panel 仍可继续扩到 active instance 的实时字段

#### 结构层仍有可继续压缩的重复
- 窗口与面板级布局/结构仍有重复模式
- 复杂区域外围 chrome 还未完全统一到当前 Builder 习惯用法

### Phase 1 完成标准
- 窗口管理、平台边界、Developer runtime 观测面三者形成稳定闭环。
- 主要 web 运行时能力都经 `src/platform/web` 进入。
- `WM`、`Codec`、`Storage` 至少成为真实 runtime 面板。
- 新窗口/面板默认遵循现有 authoring 范式，不再出现大段手工 body/render 代码。

## Phase 2：Developer Runtime 与平台能力扩展

这一阶段继续沿当前主线展开，但重点从“收口结构”转为“补运行时观测”。

### 工作项
- `Worker` panel 接真实 worker registry / task 状态。
- `Surface` panel 接 compositor / layer tree / draw stats。
- `Inspector` panel 接真实选中对象或 runtime target。
- `Codec` panel 继续扩到 active instance 的实时字段。
- `Storage` panel 补更完整的 header / filter / 状态展示。
- 必要时补 runtime registry 体系，但不做抽象过度设计。

### 完成标准
- Developer 不再只是 UI demo，而是运行时观测台。
- 窗口、codec、storage、worker、surface 至少有可追踪的真实状态。

## Phase 3：编辑器数据模型与 Timeline 业务化

这一阶段承接旧计划中的业务模型主线，但它发生在 Window / Platform / Developer Runtime 收口之后。

### 工作项
- 定义核心业务模型：
  - `Project`
  - `Sequence`
  - `Track`
  - `Clip`
- Timeline view model 映射。
- playhead。
- selection。
- click-to-seek。
- 最小命令系统与 Undo / Redo。

### 完成标准
- 浏览器内可以打开一个真实 sequence。
- Timeline 显示真实 tracks / clips。
- 用户可以点击片段并改变 selection。
- playhead 可以定位。
- 至少一类编辑操作可撤销/重做。

## Phase 4：媒体导入、解码与预览

这一阶段在前面两层基础之上推进真实媒体链路。

### 工作项
- `MediaAsset` / source model。
- OPFS -> asset pipeline。
- decoder lifecycle。
- preview clock / render path。
- 基础缓存与后台任务模型。

### 完成标准
- 用户可以导入媒体文件。
- 工程模型中出现真实素材资产。
- 至少能请求并获取一段 clip 对应的视频帧或音频数据。
- 预览窗口可以显示和播放基础内容。

## Phase 5：工作台组装与导出

这一阶段把原来的“工作台组装”和“导出交付”放在同一阶段处理，避免过早展开细节。

### 工作项
- 主工作台布局。
- Timeline / Preview / Browser / Inspector 协同。
- 基础剪辑交互与属性编辑。
- `VideoEncoder` / `AudioEncoder`。
- mux 与后台导出任务。

### 完成标准
- 浏览器中形成完整的非编工作台。
- 用户可以导入素材、放入时间轴、进行基础剪辑并实时预览。
- 用户可以把当前 sequence 导出为可播放文件。

# 当前最近优先级

接下来 2-3 个迭代应严格围绕 Canvas Interface 收口推进：

1. 继续完善 `WindowManager`。
2. 补齐剩余 `platform/web` 迁移与边界约定。
3. 把 `Worker` / `Surface` / `Inspector` 变成真实 runtime 面板。
4. 继续压缩窗口与面板层的重复结构。
5. 然后再进入编辑器数据模型与 Timeline 业务化。

不应优先做的事情：
- 过早推进 `Project / Sequence / Track / Clip`。
- 在平台边界未稳定前接大量真实媒体链路。
- 新增更多宽泛 UI 抽象。
- 过早做 workspace / docking / window JSX 化。
- 把 Timeline 强行迁到 Builder。

# 风险与缓解

## 1. WindowManager 重新分散
- 风险：如果在它未完全收口前继续新增窗口逻辑，焦点、z-order、最小化、窗口状态可能再次散回各处。
- 缓解：后续窗口相关能力统一经 `WindowManager` 进入，不在 `main.ts`、`CanvasUI`、单个窗口类里重复发明入口。

## 2. 浏览器绑定点重新渗回业务层
- 风险：如果 `document` / `window` / `navigator` / WebCodecs / OPFS 访问重新散回业务代码，会直接破坏未来 native runtime 迁移。
- 缓解：继续把运行时能力经 `src/platform/web` 收口；业务层默认不直接读浏览器全局。

## 3. Developer 面板长期停留在说明态
- 风险：如果 `Worker` / `Surface` / `Inspector` 长期只是说明文本，Developer 会失去作为 runtime 观测台的价值。
- 缓解：优先给这些面板接真实 registry / runtime 数据，而不是继续扩说明型 UI。

## 4. 平台边界未稳时过早推进媒体链路
- 风险：过早接入真实媒体链路，会把 WebCodecs、VideoFrame、OPFS、后台任务生命周期问题扩散到业务层。
- 缓解：先完成 Window / Platform / Developer Runtime 三条线的边界固定，再进入媒体导入、解码与预览。
