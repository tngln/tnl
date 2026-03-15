## 现状更新
- 本文档是 Explorer 窗口的初始设计方案。
- **当前状态：✅ 已实现**
- `src/ui/windows/explorer_window.tsx` 已实现：
  - Explorer 窗口骨架
  - 地址栏（breadcrumb + 输入框）
  - List/Thumbnails 视图切换
  - OPFS 文件列表
  - 右侧详细信息面板
  - 文件操作（Import/Export/Delete/Rename/Move）

## 目标（已完成）
为 tnl（Canvas UI）新增一个 Explorer 窗口，用于管理 OPFS（Origin Private File System）里的媒体与项目资源。整体交互风格与现有 Developer.Storage 面板一致，但提供"资源管理器"的核心体验：地址栏（以 OPFS 根为起点）、列表/缩略图两种视图（视频文件可显示缩略图）、以及右侧详细信息面板。

## 现状与可复用基础
- UI 容器与面板范式
  - Developer.Storage 使用 `defineSurface + mountSurface` 与 `PanelColumn/PanelHeader/PanelActionRow/PanelScroll/RowItem` 组成面板式 UI：用于状态栏、操作栏、滚动内容列表。
  - Developer Tools 的 tab 容器由 `TabPanelSurface` 承载，窗口 body 由 `SurfaceWindow` 挂载。
- OPFS 数据层
  - `openOpfs()` 提供 `OpfsFs`：读写/删除/移动/列举/元信息（type、extras）更新、usage 统计。
  - 当前 DB 仅存储"文件条目"（无目录条目）；`list(prefix?)` 语义是"返回 prefix 下所有文件（递归）"。

## 窗口定位与入口
Explorer 作为"编辑器工具窗口"存在（独立于 Developer Tools），在 WindowManager 中可打开/关闭、可缩放、可记忆上次大小（若现有 window 系统支持）。

建议窗口结构：

- ExplorerWindow（SurfaceWindow）
  - Body: ExplorerSurface（单 Surface，内部管理所有状态）

## UI 布局（信息架构）

采用三段式布局（从上到下 / 从左到右）：

1) 顶部工具区（固定高度）
- 地址栏（Address Bar）
  - Breadcrumb：`/` 分段按钮（点击跳转到该层）
  - 可编辑路径输入框（TextBox）：允许直接输入相对路径并回车跳转
  - Back / Forward（历史栈）
  - Up（到上级目录）
- 视图切换
  - List / Thumbnails 两个 toggle
- 可选：Filter 输入框（按名称过滤当前目录显示）

2) 中部主视图区（可滚动）
- List 模式：表格化列表（每行一个条目）
  - 行：目录/文件（目录优先）、名称、类型、大小、更新时间（或 createdAt/updatedAt）
  - 单击选中，双击进入目录 / 打开文件
- Thumbnails 模式：Tile 网格（可滚动）
  - 每个 tile：缩略图（视频优先）、标题（文件名）、角标信息（时长/分辨率可选）
  - 网格实现建议：按 viewport 宽度计算列数，把条目 chunk 成"多行 Row"，每行固定 cell 宽高（用现有 Row/Column 组合即可）

3) 右侧详细信息面板（固定宽度，可折叠）
- 选中项摘要：图标/缩略图、名称、路径
- 元信息：类型、大小、createdAt、updatedAt、extras（结构化展示，而非纯 JSON）
- 操作按钮：
  - Import（上传到当前目录）
  - Export（下载选中项）
  - Delete
  - Rename / Move（可选，基于 `fs.move`）
  - Refresh

## 目录语义（在"无目录 DB"约束下的方案）

由于当前 `OpfsFs` 的 DB 只维护文件条目，不维护真实目录树，Explorer 的"目录"采用"虚拟目录"：

- 目录存在性：只要有任意文件路径以 `dir/` 开头，则认为 `dir` 目录存在。
- 当前目录 `cwd`：用一个 `cwdPrefix: string | null` 表示；`null` 代表 OPFS 根。
- 列出当前目录的"直接子项"：
  - 基于 `fs.list(cwdPrefix?)` 返回的递归文件集合，投影出：
    - 直接子目录（下一段 path segment）
    - 直接子文件（path 在当前目录下且不再包含 `/`）
- 目录条目显示为：`type = "inode/directory"`（仅 UI 层标注），点击进入仅改变 `cwdPrefix`，不触发 OPFS 写入。

隐藏系统文件/目录建议：
- 默认隐藏以 `.tnl-` 或 `.` 开头的根级系统文件（例如 `.tnl-db.json`、缓存缩略图目录），但在"Developer.Storage"仍可见。
- Explorer 可提供"Show hidden"开关（可选）。

## 文件类型与显示策略

类型来源优先级：
1) DB entry 的 `type`（写入时可设置）
2) 文件扩展名推断（仅 UI 层显示辅助）

显示策略：
- 视频（video/* 或扩展名 mp4/webm/mov/mkv 等）：支持缩略图、可显示 duration/resolution（若已解析）
- 图片（image/*）：缩略图直接用图片自身（可选）
- 其他：统一图标占位

## 视频缩略图设计

目标：在 Thumbnails 模式中为视频文件显示稳定、可缓存的缩略图，避免每次渲染都重新解码视频。

### 缩略图缓存落点

推荐将缩略图作为派生资源写回 OPFS（而不是塞进 DB JSON）：
- 缩略图文件路径：`.tnl-cache/thumbs/<entry.id>.webp`（或 jpg）
- 在 entry.extras 记录：
  - `thumbPath`: string（缩略图文件路径）
  - `thumbUpdatedAt`: number
  - `videoMeta`: { durationMs, width, height, ... }（可选）

这样做的好处：
- DB 不膨胀（避免 base64/大 JSON）
- 缩略图可被按需读取与复用
- 未来可扩展多尺寸缩略图

### 生成策略（惰性 + 队列）

- 仅在需要展示缩略图的场景触发（Thumbnails 模式、并且 tile 可见或即将可见）
- 维护一个生成队列（并发 1~2），避免大量视频并行解码导致卡顿
- 对每个 entry 维护"缩略图状态"：
  - missing / generating / ready / failed
- 生成过程（Web API）：
  - `fs.readFile(path)` → Blob
  - `URL.createObjectURL(blob)` → `<video>` 加载
  - seek 到一个稳定时间点（例如 0.0s 或 min(1s, duration*0.1)）
  - 把当前帧绘制到 `<canvas>`，再 `canvas.toBlob("image/webp", quality)`
  - `fs.writeFile(thumbPath, blob, { type: "image/webp" })`
  - `fs.updateMeta(path, { extras: { ...prev, thumbPath, thumbUpdatedAt, videoMeta } })`
- 失败回退：显示默认图标；点击"Retry thumbnails"（可选）

### 失效条件

- entry.updatedAt 或 entry.size 变化时，认为源文件变更，缩略图需要重建（通过 `thumbUpdatedAt` 与 entry.updatedAt 对比或额外存 `thumbSourceUpdatedAt`）。

## 交互细节

- 导航
  - 单击目录：选中
  - 双击目录 / Enter：进入目录（push 到历史）
  - Back/Forward：回到历史 cwd
  - Up：到上级（根无上级）
  - 地址栏输入：支持 `a/b/c`（相对路径）；空字符串表示根
- 选择
  - 单选为主（与现有 RowItem 行为一致）
  - 未来可扩展多选（Shift/Ctrl）
- 操作
  - Import：用文件选择器，写入 `cwdPrefix` 下
  - Export：读取 blob 并下载
  - Delete：二次确认
  - Rename/Move：基于 `fs.move`，目标路径在当前 cwd 下
- 状态栏
  - 复用 StoragePanel 的 busy/error/status 机制：顶部或 header 右侧展示 Working/Error/统计（例如"当前目录 N 项 · 选中项大小"）

## 状态模型（ExplorerSurface 内部）

建议最小状态集合：

- `cwdPrefix: string | null`
- `viewMode: "list" | "thumbs"`
- `entriesAll: OpfsEntryV1[]`（来自 `fs.list(cwdPrefix?)` 的递归集合或 root 全量集合）
- `items: ExplorerItem[]`（投影后的"直接子项"，含虚拟目录）
- `selected: ExplorerItem | null`
- `busy: boolean`, `error: string | null`
- `history: { stack: string[]; index: number }`
- `thumbCache: Map<string, ThumbState>`（key 用 entry.id 或 path）

ExplorerItem（UI 层类型）建议：
- `kind: "dir" | "file"`
- `name: string`
- `path: string`（dir 用 prefix 路径；file 用 entry.path）
- `entry?: OpfsEntryV1`（file 才有）

## 数据访问策略（性能）

两种可选策略（按实现复杂度从低到高）：

1) 简单策略（优先推荐起步）
- 每次进入目录：调用 `fs.list(cwdPrefix?)`，然后在前端投影出"直接子项"
- 优点：实现简单、与现有 StoragePanel 一致
- 缺点：目录层级深时，某些目录进入会拉取递归集合（但 DB 本质仍是内存 JSON，代价通常可接受）

2) 索引策略（后续优化）
- 打开窗口时一次性 `fs.list()` 取全量，构建前端索引（prefix → children）
- 进入目录仅查索引
- 对 write/delete/move 后做增量更新或全量 refresh

## 错误处理与一致性

- 复用 StoragePanel 的 `opSeq` 模式，避免并发操作回写过期 UI。
- 所有用户可见错误统一显示在 header/status 区，并允许一键 Refresh。
- 不在日志/错误里输出任何敏感路径以外的信息（OPFS 属同源私有空间，仍应保持最小暴露）。

## 交付拆分（实现里程碑）
- M1：Explorer 窗口骨架 ✅
- M2：Thumbnails 模式 ✅
- M3：操作完善 ✅
