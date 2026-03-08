﻿
project: tnl (Tung's Non-Linear Editor)
mode: plan
target: Chromium (PC/Mac), Canvas UI, no framework

---

# 目标与范围

- 产品定位：专业向的轻量级非编与合成工具，类 Premiere/Vegas 的工作流；不做 CapCut 式新手向引导。
- 运行环境：PC/Mac 下 Chromium-based 浏览器；依赖 WebCodecs 等现代能力。
- UI 形态：完全 Canvas-based（含文本/图标渲染、交互、布局），不引入前端框架。
- 典型用例：屏幕录制剪辑、解说视频合成、简单非编工程、简单 Motion Graphics。
- 非目标：移动端、跨浏览器兼容（非 Chromium）、复杂特效/3D、海量模板生态、协作/云端渲染等。

# 核心原则

- 媒体与时间轴优先：工程结构、时间线模型、播放与导出链路先打通，再逐步丰富编辑能力。
- 可验证的里程碑：每个阶段都能在浏览器内完整“导入 → 编辑 → 播放 → 导出”闭环。
- 性能优先：解码/渲染走硬件路径（WebCodecs/VideoFrame/WebGL/WebGPU 可选），避免主线程阻塞。
- 可靠性优先：明确资源生命周期（帧/缓冲区/文件句柄）、一致的撤销重做、可恢复工程。

# 阶段性路线图（迭代顺序）

## Phase 0：基础设施与 UI 框架（已完成）

我们已经构建了一个高性能、类原生的 Canvas UI 框架，为后续的非编应用提供了坚实基础。

### 核心架构
- **构建环境**：初始化 Bun + TypeScript 项目，配置 High-DPI Canvas 上下文。
- **响应式系统**：实现了细粒度的 Reactivity 系统（Signal/Effect），作为状态管理核心；并提供全局可调试信号注册表（供 DevTools 读取）。
- **渲染循环**：`CanvasUI` 负责主循环，实现了**脏矩形（Dirty Rect）**与局部重绘机制，大幅优化性能。
- **图层合成**：引入 `Compositor` 与 `OffscreenCanvas`，支持多图层混合（Blend Mode）与独立渲染上下文。

### UI 组件系统
- **Surface/Viewport**：实现了内容（Surface）与视口（Viewport）分离的架构，支持裁剪、坐标变换与滚动。
- **窗口管理**：`WindowManager` 支持多窗口（`ModalWindow`）管理，实现了拖拽、缩放、最小化、层级堆叠。
- **基础控件**：`Button`, `Checkbox`, `Radio`, `Label`, `Paragraph` 等基础交互组件。
- **列表基础控件**：`Row`（行渲染与 hover/selected/click 交互）、`Scrollbar`（滚动条）。
- **布局容器**：
  - `TabPanelSurface`：支持多标签页切换的容器。
  - `DividerSurface`：支持拖拽调整比例的分栏容器。
- **无边框窗口**：`ToolDialog` 支持工具类悬浮窗。

### 开发者工具
- **DeveloperToolsWindow**：重构了开发者工具，采用模块化面板设计。
- **面板骨架**：预置了 Data, Storage, Control, WM, Timeline, Worker, Codec, Surface, Inspector 等 9 大面板的扩展点。
- **Data 面板（已落地）**：展示全量 signals，按 scope 分组，支持展开/折叠与滚动浏览。
- **Storage 面板（已落地）**：接入 OPFS 文件系统，支持浏览/上传/下载/删除，并可编辑元数据与查看 quota/usage。
- **Control 面板**：集成了组件库展示与交互测试。

---

## Phase 1：数据模型与时间轴 UI（进行中）

本阶段将重点构建非编系统的核心数据结构，并利用 Phase 0 的 UI 能力实现可视化的时间轴。

- **工程模型**：定义 `Project`, `Sequence`, `Track`, `Clip` 的数据结构，接入 Reactivity 系统。
- **时间轴 Surface**：
  - 利用 `DividerSurface` 实现左侧“轨道头”与右侧“时间线”的分栏。
  - 实现 `TrackSurface`，支持虚拟滚动（Virtual Scrolling）以承载大量片段。
  - 实现时间刻度尺（Ruler）与播放头（Playhead）绘制。
- **命令系统**：实现基于 Command Pattern 的 Undo/Redo 架构。
- **DevTools 集成**：
  - 完善 `Data` 面板：实时展示工程数据树。
  - 完善 `WM` 面板：可视化管理窗口层级与状态。

## Phase 2：媒体引擎与资源管理

本阶段接入 WebCodecs 能力，打通从文件到内存的链路。

- **存储层（VFS）**：基于 OPFS (Origin Private File System) 封装文件访问接口与元数据数据库（JSON DB，支持 CRUD 与 usage 汇总）。
  - *DevTools*: `Storage` 面板用于分析/整理/清理 OPFS 数据（已具备基本浏览与管理能力，后续扩展统计/批量清理）。
- **解码管线**：封装 `VideoDecoder` / `AudioDecoder`，实现 `Clip` 到 `VideoFrame` 的异步获取。
  - *DevTools*: 实现 `Codec` 面板，监控解码器状态与缓冲。
  - *DevTools*: 实现 `Worker` 面板，监控后台解码线程。
- **资源管理**：实现 LRU 缓存策略，管理高内存占用的 VideoFrame。
- **导入流程**：实现文件拖拽导入，解析容器格式（Demux），提取元数据。

## Phase 3：渲染引擎与实时预览

本阶段将利用 Compositor 实现视频流的实时合成与播放。

- **高级合成**：扩展 `Compositor`，支持视频帧纹理上传、仿射变换（Transform）、透明度合成。
- **渲染时钟**：实现与音频上下文（AudioContext）同步的渲染主时钟。
- **预览窗口**：实现 `PreviewSurface`，支持 1:1 像素渲染与缩放查看。
- **DevTools 集成**：
  - 完善 `Surface` 面板：可视化调试 Compositor 图层树与绘制指令。
  - 完善 `Timeline` 面板：监控渲染帧率与掉帧情况。

## Phase 4：编辑器交互与工作台组装

本阶段将零散的 Surface 组装成完整的非编工作台。

- **主界面布局**：使用 `Divider` 与 `TabPanel` 组合出经典的非编布局（资源库、预览、属性、时间轴）。
- **交互编辑**：
  - 实现时间轴片段的拖拽移动、边缘修剪（Trim）、吸附（Snap）。
  - 实现多选与框选交互。
- **属性面板**：实现 `Inspector` 面板，支持对选中 Clip 的属性（位置、缩放、音量等）进行编辑。
- **脚本能力**：*DevTools* `Inspector` 面板支持执行简单脚本查询/修改编辑器状态。

## Phase 5：导出与交付

- **编码与封装**：接入 `VideoEncoder` / `AudioEncoder` 与 Muxer。
- **导出任务**：实现非阻塞的后台导出流程。
- **交付 UI**：导出设置、进度条与结果预览。

# 风险与缓解

- **WebCodecs 兼容性**：持续关注标准变化，保持解码器封装的抽象层，以便替换 polyfill。
- **Canvas 性能瓶颈**：若 2D Context 遇到瓶颈，评估迁移至 WebGL/WebGPU 渲染后端的成本（架构上已通过 Surface/Compositor 隔离）。
- **内存管理**：VideoFrame 的显存占用极高，需严格执行生命周期管理与引用计数。
