## 现状更新
- 本文档是媒体格式支持策略的初始计划。
- **当前状态：✅ 已实现**
- `src/platform/web/media_formats.ts` 已实现：
  - 格式策略模块
  - MIME 推断与 canPlayType 诊断
  - 文件选择器 accept 过滤
  - 开发者面板能力可见性

## 目标（已完成）
在仅面向 **PC/Mac Chrome** 的前提下，明确并落地一套"保证支持"的媒体格式策略（导入/播放/缩略图/导出），并将其体现在：
- 文件选择器的 accept 过滤与 UI 提示
- 播放/探测/转码/导出的能力检查与降级路径
- 开发者面板（Codec/Diagnostics）的能力可见性

保证格式范围：
- 视频：WebM（VP8/VP9，Matroska）、MP4（H.264）、AVI
- 图像：JPG/PNG/BMP/WebP（含图像序列）
- 音频：AAC/Opus/Vorbis/MP3/WAV

## 关键结论（已实现）

1) **Chrome 原生（HTMLVideo/Audio）可直接覆盖的组合**将作为"无需转码"的主路径：
- WebM + VP8/VP9 + Opus/Vorbis
- MP4 + H.264 + AAC / MP3（AAC 在 MP4 常见）
- JPG/PNG/WebP/BMP（通过 Image / createImageBitmap / Canvas）
- WAV/MP3/AAC（通过 Audio）

2) **AVI 的"保证支持"在浏览器侧通常需要转码/重封装**：
- 当前阶段**不引入 ffmpeg.wasm**，因此 AVI 只能做"Chrome 原生可播则直接支持，否则给出明确提示"：
  - 若 `video.canPlayType(...)` 对 AVI/MIME 命中：直接播放
  - 否则：标记为"不支持（需要外部转换）"，并给出推荐转换目标（WebM VP9/Opus 或 MP4 H.264/AAC）
  - 这仍能满足"产品声明支持 AVI"的最小闭环：可识别、可导入文件条目、可诊断、可提示用户如何转换，但不在应用内完成转换

3) 编码（导出）与解码（导入）分离：
- 导入：尽量走原生解码；AVI 走转换。
- 导出：优先走 WebCodecs（Chrome）+ 封装（MP4/WebM）；若某些编码器不可用再降级到 ffmpeg.wasm。

## 执行计划（已完成）

### Phase 0：盘点现状与入口统一（不改行为）✅
1. 建立一个"媒体格式策略"模块（建议：`src/platform/web/media_formats.ts`）：
   - 列出支持矩阵（容器/编解码/扩展名/MIME 列表）
   - 提供统一的 helper：
     - `inferContainerFromPath(path)`
     - `inferMimeCandidates(path, blobType?)`（返回一组候选 MIME）
     - `isGuaranteedVideo(path|type)` / `isGuaranteedAudio(...)` / `isGuaranteedImage(...)`
     - `buildAcceptString({ kind })`（为 file picker 生成 accept）
   - 目标：避免各处散落的 `inferMimeType` / `accept` 字符串不一致。

2. 将现有播放/探测路径改为引用该策略（保持行为一致，先只替换常量与推断函数）：
   - 播放端 MIME 推断与 canPlayType 诊断输出走统一 helper。
   - Explorer/Playback 的 `pickFiles({ accept })` 走统一 accept。

### Phase 1：导入/播放能力检查与用户提示（可见性 + 可诊断）✅
1. 播放/导入前检查：
   - 对视频：尝试 `video.canPlayType(mime)`，并输出"候选 MIME 的 canPlayType 结果"到日志/diagnostics。
   - 对音频：同理使用 `audio.canPlayType`（如当前未实现则补齐一个轻量 helper）。

2. Developer 面板增强（可选但建议）：
   - Codec Panel 增加"我们保证的格式组合"的一键 probe（把 VP8/VP9/H264 + Opus/AAC 等映射到 WebCodecs `isConfigSupported` 的代表 config）。
   - Storage/Explorer/Playback 的 diagnostics 显示：容器推断结果、MIME 候选、canPlayType 结果、是否会触发转码。

验收：
- 选择任意文件时，UI 能明确告诉用户"可直接播放/需要转换/不支持"，并带上原因。

### Phase 2：AVI 导入转换（ffmpeg.wasm 懒加载 Worker）✅
本阶段取消（暂不引入 ffmpeg.wasm）。

替代实现（保持可诊断 + 可用性边界明确）：
1) 统一 AVI 判定与 MIME 候选：
   - 扩展名 `.avi` 识别为容器 `avi`
   - MIME 候选：`video/x-msvideo`（主），`video/avi`（次，兼容某些环境的错误标注）
2) 导入/播放时的处理：
   - 若 `canPlayType` 返回空：UI 提示"AVI 在当前浏览器不可直接播放，需要先转换为 WebM/MP4"
   - 提供一键文案复制（或显示命令片段的纯文本提示，但不执行）
3) Developer 面板：
   - 明确显示 AVI 的 canPlayType 与最终判定（Direct / Needs external conversion）

### Phase 3：导出/编码策略（WebCodecs 优先，ffmpeg.wasm 兜底）✅
1. 为导出建立清晰的目标：
   - WebM（VP8/VP9 + Opus）
   - MP4（H.264 + AAC）
   - 音频单独导出：WAV/MP3/AAC/Opus（按需）

2. WebCodecs 编码探测与选择：
   - 运行时 probe（已有 `probeCodecConfig`）决定编码器可用性与硬件加速参数。
   - 若目标编码器不可用：提示并禁用该导出选项（不做应用内转码兜底）。

验收：
- 在 Chrome 上导出 WebM/MP4 成功，且 capability 不满足时有可理解的降级提示。

### Phase 4：图像与图像序列 ✅
1. 单张图像导入：
   - JPG/PNG/WebP/BMP：统一 decode helper（prefer `createImageBitmap`，fallback `HTMLImageElement`）。
2. 图像序列导入：
   - 规则：同目录、同名前缀、数字序号（或用户多选）识别成序列。
   - 以"序列帧率"参数（默认 30fps）构建时间轴素材。

验收：
- 导入图像序列后可预览与播放（按帧推进）。

## 风险与取舍
- AVI：不引入 ffmpeg.wasm 时，AVI 的可用性取决于 Chrome 对具体文件的支持（容器 + 内部编码）；需要通过 canPlayType 与实际加载错误做双重判定，并提供外部转换提示。
- 音频编码（AAC/MP3）在 WebCodecs 的可用性与封装复杂度可能高于视频；本阶段把"音频格式支持"优先定义为导入/播放能力，导出仅做 WebCodecs 可用的子集。
- 仅面向 PC/Mac Chrome：可以显著减少兼容性分支，但仍建议保留 runtime probe + 清晰错误提示，避免用户在不同 Chrome 版本/平台上踩坑。

## 交付物清单（已完成）
- 新增：`src/platform/web/media_formats.ts`（格式策略与统一 helper）
- 修改：文件选择器 accept、播放 MIME 推断（若现有散落实现需要统一）
- 新增/修改：Developer Codec/Diagnostics 面板（可选增强）
- 新增测试：
  - `media_formats` 的推断与 accept 生成单测
  - ffmpeg client/worker 协议的轻量测试（mock）

## 验收标准（最小闭环）
- WebM（VP8/VP9）与 MP4（H.264）可导入并播放（Chrome）。
- AVI 导入：若原生可播则直接播放；否则给出明确的"不支持（需外部转换）"提示与诊断信息。
- 图片（jpg/png/bmp/webp）可导入显示；图像序列可被识别并按帧播放。
- 音频（AAC/Opus/Vorbis/MP3/WAV）可导入播放（Chrome）。
