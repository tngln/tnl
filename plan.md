---
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

## Phase 0：仓库与工程骨架

- 建立基础目录结构（core、ui、media、timeline、renderer、export、tests、docs）。
- 统一编码规范与构建流程（TypeScript + bundler，ESM，最小依赖）。
- 本地开发：静态 server、热更新（可选）、基础 logging 与错误面板。
- 基础资产：图标、字体、主题色、可缩放 UI 度量体系。
- 简易 Flexbox-like 布局系统（core/layout.ts），用于 Canvas UI 自动排版。

交付物：
- 可以启动应用，显示 Canvas UI Shell（空工程）。

## Phase 1：工程模型与时间轴 MVP

- 工程（Project）数据结构：素材库（Media）、序列（Sequence）、轨道（Track）、片段（Clip）、关键帧（Keyframe）。
- 时间单位规范：内部以 rational time（分数帧或纳秒）表示；统一帧率/采样率换算。
- 片段属性：in/out、start、duration、source reference、变换（position/scale/rotation/opacity）。
- 撤销重做：命令式操作（Command pattern），支持合并与事务。
- 保存/加载：JSON schema + 版本号迁移策略（最小可行）。

交付物：
- 时间轴上可创建/移动/剪切简单片段（不需要真实媒体解码）。

## Phase 2：媒体导入与解码管线（WebCodecs）

- 文件导入：File/DragDrop；建立 MediaItem（视频/音频/图片）元数据。
- 解封装：优先选择“浏览器可直接解码的容器/编码”；必要时采用最小化 demux 方案（待调研）。
- 视频解码：VideoDecoder → VideoFrame；帧缓存策略（窗口缓存、LRU、seek 预热）。
- 音频解码：AudioDecoder → AudioData；PCM 缓存与分段管理。
- 代理/预览：当源素材过重时的降分辨率预览策略（后续增强）。

交付物：
- 导入一段视频后可在预览窗口播放（无时间轴编辑也可）。

## Phase 3：实时预览渲染（Canvas + GPU）

- 渲染架构：渲染线程/主线程职责划分（可选 Worker + OffscreenCanvas）。
- 合成：多图层（轨道）叠加、alpha、变换；图像缩放与色彩空间处理（最小可行）。
- GPU 路径：优先 WebGL2（成熟）；WebGPU 作为可选增强。
- 字幕/文本：基础文本渲染（Canvas2D 或 SDF 字体方案，待定）。
- 播放控制：时间线驱动的渲染时钟，与音频时钟同步策略。

交付物：
- 时间轴片段驱动预览窗口逐帧渲染（视频 + 静态图片）。

## Phase 4：编辑交互与专业化 UI（Canvas）

- 轨道/片段交互：选择、框选、多选、拖拽、吸附、滚轮缩放、快捷键体系。
- 标尺与时间刻度：可变缩放、帧对齐显示、playhead、in/out 标记。
- 属性面板：变换、裁剪、透明度、速度（基础）。
- 素材库：缩略图、搜索/分组、拖入时间轴。
- 事件系统：统一 pointer/keyboard/focus 管理，避免“交互粘连”。

交付物：
- 达到“专业软件基本可用”的剪辑体验（基本快捷键 + 面板）。

## Phase 5：导出（编码 + 封装）

- 视频编码：VideoEncoder（H.264/VP9/AV1 视浏览器支持）。
- 音频编码：AudioEncoder（AAC/Opus）。
- 封装：MP4/WebM（按浏览器支持与实现复杂度择一优先）。
- 导出 UI：进度、取消、预估、错误报告。

交付物：
- 完整闭环：导入 → 剪辑 → 导出一个可播放文件。

# 关键技术决策（待定项与默认假设）

- 默认假设：TypeScript + Vite/Esbuild 类 bundler；WebGL2 作为首选渲染后端。
- Demux 策略：先限制支持格式（如 mp4/h264+aac, webm/vp9+opus），后续再扩展。
- Worker：优先把解码与渲染拆分到 Worker（如果收益明显且实现成本可控），否则先主线程打通。

# 风险与缓解

- 容器/解封装复杂：先做“受限格式集”，再扩展；必要时引入轻量 demux。
- 同步与性能：明确时钟主导（音频优先/视频优先），实现 backpressure 与帧丢弃策略。
- Canvas UI 复杂度：建立 UI 基建（布局、命中测试、焦点管理）后再做大功能。

# 下一步（进入实现前的首批任务建议）

- 初始化 repo 与构建脚手架（TS、dev server、基础 Canvas shell）。
- 落地 Project/Timeline 数据模型 + undo/redo + JSON schema。
- 定义“最小支持格式”与解码/渲染链路验证用素材集。
