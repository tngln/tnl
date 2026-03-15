## 现状更新
- 本文档是 Worker 面板的初始计划。
- **当前状态：✅ 已实现**
- `src/core/workers.ts` 已实现：
  - `WorkerRuntimeEntry` 类型
  - `WorkerRuntimeRegistry` 接口
  - `workerRegistry` 全局实例
- `src/ui/windows/developer/panels/worker_panel.tsx` 已实现：
  - Worker 列表展示
  - Worker 详细信息面板
  - Refresh 功能
- `src/main.ts` 已注入 `workerRegistry` 到 `DeveloperContext`

## 目标（已完成）
实现一个真正可用的 `Developer.Worker` 面板，用于展示运行期 worker 相关信息（至少包含 render worker），并在架构上补齐"可被 UI 消费的 worker registry / 运行时快照"链路。

## 现状（约束与缺口）
- `Developer.Worker` 目前是占位 Info 面板：`worker_panel.ts`
- `DeveloperContext.workers` 仅有类型预留，`main.ts` 未注入任何实现
- 代码库中已实装的 worker 主要是 `tnl-render-worker`，但其队列/正在跑的 job 等状态被封装在 worker 内部

## 设计原则（本次实现遵循）
- **先让面板"有数据"**：优先打通 render worker 的可观测性，其他 worker（未来增加）可渐进接入。
- **UI 只读快照**：Developer 面板读取 registry 的 snapshot，不直接持有/操控 Worker 实例。
- **低侵入、可扩展**：以 registry 统一建模 worker 与 task/job 状态，未来增加更多 worker 时不改面板结构。

## 实施步骤（已完成）

### 1) 增加 Worker Registry（数据模型 + 注册/快照 API）
- 新增文件：`src/core/workers.ts`
  - `WorkerRuntimeEntry`（建议字段）
    - `id: string`（稳定 id，例如 `"render"`）
    - `name: string`（展示名，例如 `"tnl-render-worker"`）
    - `kind: string`（例如 `"render" | "decode" | "io"`，先用 string）
    - `createdAt: number`
    - `status: "running" | "stopped" | "error"`
    - `lastMessageAt?: number`
    - `metrics?: { pending?: number; inFlight?: number; queued?: number; completed?: number; canceled?: number; lastError?: string }`
  - `registerWorker(entry)` / `updateWorker(id, patch)` / `unregisterWorker(id)`
  - `listWorkers(): WorkerRuntimeEntry[]`

### 2) 让 RenderEngine 注册到 Worker Registry，并采集主线程可得的指标
- 修改：`src/render/render_engine.ts`
  - 在创建 `new Worker(...)` 后注册一个 entry（id 建议 `"render"`）。
  - 在主线程收到 worker message 时更新 `lastMessageAt`。
  - 从 `RenderEngine.pending`（已有 `Map<number, Pending>`）派生指标：
    - `inFlight/pending`（至少能显示当前 in-flight request 数）
  - 在 `dispose/close`（若有）或异常路径上更新 `status`。

### 3) （可选但推荐）补齐 worker 线程侧队列可观测性：定期/按事件上报 stats
- 修改：`src/render/worker_protocol.ts`、`src/render/render_worker.ts`、`src/render/render_engine.ts`
  - 协议增加可选消息：`{ type: "stats", ... }`
    - 例如：`queued`, `completed`, `canceled`, `activeJobId?`, `lastJobReason?`
  - render_worker 在 enqueue/pump/cancel 等关键点调用 `postMessage({ type: "stats", ... })`
  - render_engine 处理 stats，更新 registry 的 `metrics`

### 4) 把 worker registry 注入 DeveloperContext
- 修改：`src/main.ts`
  - 在构造 `DeveloperContext` 的位置注入：
    - `workers: { list: () => listWorkers() }`
  - 若需要 `info()`（类似 codecs），也可以提供：
    - `workers: { list, info }`，其中 `info` 返回更粗粒度系统信息（例如 worker 总数、是否支持 SharedArrayBuffer 等）

### 5) 实现真正的 `Developer.Worker` 面板（替换占位 Info）
- 目标：把 `src/ui/windows/developer/panels/worker_panel.tsx` 从占位 Info 改为真实 Builder 面板（风格对齐其它 Developer 面板：VStack/HStack/ListRow）。
- 建议改动：
  - 新增或替换为 TSX 面板文件：`src/ui/windows/developer/panels/worker_panel.tsx`
    - `createWorkerPanel(): DeveloperPanelSpec` 保持 `id: "Developer.Worker"` 与 `title: "Worker"`
    - `defineSurface` + `mountSurface` 架构对齐其它面板
  - UI 结构建议：
    - `PanelHeader`：标题 `"Workers"`，meta 显示 `"N workers"` 或 `"No registry"`
    - `PanelSection: "Summary"`：显示 worker 总数、running/error 数
    - `PanelSection: "Workers"`：逐条 `ListRow`（left: `${name} (${kind})`，right: `status · inFlight/queued/...`）
    - `PanelSection: "Selected"`（可选）：点击选中某个 worker 后显示更详细的 key-value（lastMessageAt、createdAt、lastError）
    - `PanelActionRow`：`Refresh`（强制 invalidate；若实现了 stats 协议可额外提供 `Reset counters` 但不强制）

### 6) 测试与回归
- 单元测试（建议）：
  - 为 `src/core/workers.ts` 增加 registry 行为测试（register/update/unregister/list）。
- 全量回归：
  - `bun run check`
  - `bun test`

## 交付物清单（执行阶段会修改/新增的文件）
- 新增：`src/core/workers.ts` ✅
- 修改：`src/render/render_engine.ts` ✅
- （可选）修改：`src/render/worker_protocol.ts`、`src/render/render_worker.ts`
- 修改：`src/main.ts` ✅
- 替换/新增：`src/ui/windows/developer/panels/worker_panel.tsx` ✅
- 修改：`src/ui/windows/developer/index.ts` ✅
- （建议新增测试）`src/core/workers.test.ts`

## 验收标准
- Developer.Worker 面板可展示至少一个 worker（render）及其运行指标。
- 不依赖手工刷新也能反映基本变化（至少 lastMessageAt/inFlight 更新）；若实现 stats 协议则能展示 queued/completed/canceled。
- `bun run check` 与 `bun test` 全量通过。
