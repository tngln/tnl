# 渲染与回放系统：Buffer 渲染 + Proxy（v1 计划）

本文档是 tnl 编辑器预览渲染/回放链路的 v1 实施计划。目标是把“实时预览”和“复杂合成”之间的矛盾，收敛到一套可降级、可缓冲、可后台化的模型里。

---

## 1) 背景与目标

视频编辑器的预览有两个天然矛盾：

1. 合成复杂度不稳定：多轨叠加、缩放、裁剪、颜色、字幕、蒙版等会造成渲染成本突增。
2. 播放体验需要稳定：用户期待播放时“时间持续前进”，而不是频繁卡住等待渲染。

因此 v1 的目标不是“永远实时”，而是：

- **优先保证播放时钟持续前进**：当渲染赶不上时允许丢帧，避免卡住。
- **提供 ahead-buffer**：提前渲染未来帧，平滑短时抖动。
- **提供 proxy（低清代理）**：复杂情况下自动切到低清版本保持实时性，并可在负载下降后恢复原始画质（hysteresis）。
- **渲染后台化**：合成/取帧在 worker 中完成，主线程负责 UI、时钟与调度。

实时预算参考：

- 60fps：每帧 16.7ms
- 30fps：每帧 33.3ms

可接受行为（v1）：

- 播放：允许丢帧（显示最新可用帧），不允许时间倒退或“停住等帧”。
- Scrub：只保证最后一次拖动目标帧快速收敛，允许中间帧被取消/丢弃。

---

## 2) 术语

- **FrameTime**：序列的时间表示 `{ frame, fps }`。内部统一用 frame，秒仅用于边界 API。
- **Representation**：资产的某种表示：`original`（原始）/ `proxy`（低清）。
- **ProxySpec**：代理规格（分辨率、fps、码率、codec 等）。
- **RenderGraphSnapshot**：可渲染快照（v1 最小字段集合）。
- **FrameRingBuffer**：主线程持有的环形帧缓存，用于播放稳定。
- **Budget**：目标帧预算（例如播放 33ms）。
- **Late Frame**：渲染完成时间超过预算的帧，用于触发自动降级。

---

## 3) 总体架构图（文字版）

```
UI / Clock (main)
  -> RenderEngine (main)
      -> RenderWorker (worker)
          -> JobScheduler (worker)
          -> Decode / Composite (worker)
      -> FrameRingBuffer (main)
  -> Preview Surface (main draw)
```

主线程：

- 决定当前 playhead、是否 playing、渲染目标尺寸、质量模式（full/proxy/auto）。
- 维护 `FrameRingBuffer`，用“最新可用帧”绘制预览。

Worker：

- 执行实际 render（解码/合成/缩放），产出 `ImageBitmap` 发送回主线程。
- `JobScheduler` 按优先级决定下一帧：`scrub > playback current > playback ahead > thumbnail > export`。
- 支持 cancel：seek/scrub 时应取消旧任务链。

---

## 4) 数据模型

### 4.1 FrameTime

- `FrameTime = { frame: number; fps: number }`
- v1 默认量化到整数帧：`frame = round(frame)`
- 提供转换函数：
  - `frameToSeconds(frame, fps)`
  - `secondsToFrame(seconds, fps)`

### 4.2 ProxySpec（v1 规划）

```ts
type ProxySpec = {
  w: number
  h: number
  fps: number
  codec: string // e.g. "vp09.00.10.08" or "avc1.4d401f"
  bitrate?: number
}
```

### 4.3 RenderGraphSnapshot（v1 最小集合）

v1 只要求能表达“序列 fps + 未来可扩字段”，不强行落完整轨道/特效 schema：

```ts
type RenderGraphSnapshotV1 = {
  version: 1
  fps: number
  tracks?: unknown
}
```

---

## 5) 核心算法

### 5.1 ahead-buffer 填充策略

- playing 时：以 `targetFrame` 为中心，优先渲染当前帧，其次向前填充 `N` 帧（例如 8-24 帧，取决于 FPS 与分辨率）。
- 若 worker 处理不过来：允许跳过中间帧，只展示最新可用帧。

### 5.2 scrub cancel 策略

- scrub/seek 发生时：取消所有旧的 scrub 链路请求，仅保留最后一次目标帧为最高优先级。
- 若用户持续拖动：只要最后目标帧能快速出图即可，不保证每次 move 都有结果。

### 5.3 auto quality hysteresis

- 连续 `X` 帧 late：从 `full -> proxy`
- 连续 `Y` 帧 on-time：从 `proxy -> full`
- X/Y 默认值（建议）：`X=3`，`Y=12`（避免抖动频繁切换）

---

## 6) Proxy 格式：`tnlp`（v1 计划）

目标：无 muxer 依赖、可随机 seek、直接喂 WebCodecs `VideoDecoder`。

文件结构：

1. Header（JSON，UTF-8）
   - codec string
   - codedWidth/Height
   - fps
   - decoder config（如 SPS/PPS / extradata）
   - keyframe 索引（timestamp/frame -> file offset）
2. Body
   - EncodedVideoChunk 串（每块保存时间戳、keyframe 标记、offset/len）

Seek 流程：

- 定位目标帧对应 timestamp
- 从最近 keyframe offset 开始读 chunk 并喂 decoder，直到目标帧解出

兼容与版本：

- header 内必须有 `formatVersion`
- v1 只保证同版本读取；未来升级需提供迁移策略

---

## 7) 观测与调试（Developer 面板指标）

建议暴露：

- buffer 命中率：`ringbuffer.hits / (hits+misses)`
- buffer size / capacity
- late frame 比例与连续 late 统计
- proxy 使用率（auto 模式下 full/proxy 输出比例）
- worker 侧 decode/composite 时间（后续接入真实解码/合成后）

---

## 8) 里程碑

- M1：FakeFrameProvider + RingBuffer（无媒体）
- M2：单视频资产 WebCodecs 解码取帧
- M3：单轨单 clip 合成输出
- M4：Proxy 生成与使用（tnlp v1）
- M5：多轨与基础转场/叠加

---

## 备注：当前 v1 代码落点（实现约定）

- `src/render/*`：RenderEngine、ringbuffer、scheduler、auto-quality 与 worker 协议
- worker 入口：`src/render/render_worker.ts`（OffscreenCanvas 2D -> ImageBitmap）

