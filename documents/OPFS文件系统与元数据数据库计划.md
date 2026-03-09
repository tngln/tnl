# OPFS 文件系统与元数据数据库（src/core/opfs.ts）计划

## 目标
- 在 `src/core/opfs.ts` 实现一个基于 OPFS（Origin Private File System）的简单文件系统封装。
- 支持基本增删查改（CRUD）：写入/读取/列举/移动/删除/更新元信息。
- 支持查询当前“总使用量”（至少包含：我们管理的文件总大小、条目数；并尽可能提供浏览器配额/已用空间）。
- 用一个 JSON 文件作为核心数据库，记录文件名、路径、大小、类型等基础元数据；允许可选扩展字段（例如视频分辨率、时长等）。

## 设计原则
- **简单可靠**：优先保证一致性与可恢复；功能足够支持后续剪辑工程缓存与 DevTools Storage 面板。
- **原子更新**：数据库 JSON 写入采用“写临时文件 → rename/replace”的方式，避免中途崩溃导致 DB 损坏。
- **可迁移**：DB 结构包含 `version`，预留迁移入口。
- **无第三方依赖**：仅使用 Web 标准 API 与现有项目工具。
- **可调试**：提供清晰的错误类型/错误码（或统一 Error message），便于 Storage 面板展示。

## 数据模型（JSON 数据库）
数据库文件建议固定为根目录下：`/.tnl-db.json`（或 `/.tnl/opfs-db.json`，最终以实现选定为准）。

### DB 顶层结构
```ts
type OpfsDbV1 = {
  version: 1
  updatedAt: number
  entries: Record<string, OpfsEntryV1> // key 为 entryId（稳定 ID）
}

type OpfsEntryV1 = {
  id: string
  path: string              // 逻辑路径，例如 "media/abc.mp4"
  name: string              // basename
  type: string              // mime 或逻辑类型（"video/mp4" / "application/json" 等）
  size: number              // bytes
  createdAt: number
  updatedAt: number
  extras?: Record<string, unknown> // 可选扩展：width/height/duration/fps/codec...
  checksum?: string         // 可选：后续用于校验或去重
}
```

### 约束
- `path` 在 DB 内唯一（同一路径只允许一个 entry）。
- `size` 以写入后 `File`/`Blob` 实际大小为准。
- `extras` 不做强 schema，先作为 `Record<string, unknown>`，后续按媒体类型逐步标准化。

## 公共 API（opfs.ts 对外导出）
以“一个 OpfsFs 实例”方式组织，避免到处散落 handle：

### 初始化与根目录
- `openOpfs(): Promise<OpfsFs>`：获取 OPFS 根目录句柄并加载 DB。
- `OpfsFs.close(): void`：释放内部缓存/锁（如有）。

### CRUD
- `OpfsFs.writeFile(path: string, data: Blob | ArrayBuffer | Uint8Array, meta?: { type?: string; extras?: Record<string, unknown> }): Promise<OpfsEntryV1>`
- `OpfsFs.readFile(path: string): Promise<Blob>`（或 `Uint8Array`，实现可同时提供两个接口）
- `OpfsFs.stat(path: string): Promise<OpfsEntryV1 | null>`
- `OpfsFs.list(prefix?: string): Promise<OpfsEntryV1[]>`（支持按目录前缀过滤）
- `OpfsFs.delete(path: string): Promise<void>`（删除文件并从 DB 移除）
- `OpfsFs.move(from: string, to: string): Promise<void>`（OPFS rename + DB 更新）
- `OpfsFs.updateMeta(path: string, patch: { type?: string; extras?: Record<string, unknown> }): Promise<OpfsEntryV1>`

### 使用量
- `OpfsFs.getUsage(): Promise<{ entries: number; bytes: number; quota?: number; usage?: number }>`
  - `entries/bytes`：来自 DB 汇总
  - `quota/usage`：如果浏览器支持 `navigator.storage.estimate()`，则提供系统级估算

## 内部机制

### 1) DB 读写与缓存
- 初始化时读取 DB 文件；不存在则创建空 DB（`version: 1`）。
- 内存中保持 `db` 对象；每次变更后 `flushDb()` 落盘。

### 2) 原子落盘策略
- 写入：`/.tnl-db.json.tmp` 写完后 `move`/`replace` 到正式文件名。
- 若 replace 不可用：先删除旧文件再 rename（需要评估 OPFS 的行为并兼容）。

### 3) 并发与锁
- 同一实例内用一个 async mutex（简单 Promise 队列）串行化 DB 写入与文件写入，避免竞态。
- 多 Tab 并发暂不解决（后续可加 `navigator.locks`）；本阶段先在文档 TODO 标注。

### 4) 路径规范化
- 统一使用 POSIX 风格：不允许以 `/` 开头，不允许 `..`，连续 `/` 归一化。
- 提供内部 `normalizePath()`，对外所有 API 先规范化。

### 5) 错误与异常
- 定义 `OpfsError`（或 `Error` 子类）：
  - `code`: `"NotFound" | "AlreadyExists" | "InvalidPath" | "DbCorrupted" | "PermissionDenied" | "Unknown"`
  - `message`：面向面板的可读描述
- DB JSON 解析失败时：抛 `DbCorrupted`，并保留一个“备份重建” TODO（后续 Storage 面板可做修复按钮）。

## 与 DevTools Storage 面板的关系（前置约定）
本模块应提供 Storage 面板需要的最小信息：
- 列表：`list(prefix)` 直接给出 entries，按 size 排序由面板完成。
- 使用量：`getUsage()`。
- 清理：`delete(path)` / `delete(prefix)`（后续可扩展批量删除）。

## 实施步骤（执行顺序）
1. 新建 `src/core/opfs.ts`：实现 `openOpfs()`、路径规范化、DB 结构与加载/保存。
2. 实现文件 CRUD：write/read/stat/list/delete/move/updateMeta。
3. 实现 `getUsage()`：DB 汇总 + `navigator.storage.estimate()`。
4. 添加最小单元测试（如可在 Bun 环境模拟则写；否则写“纯函数”部分测试：path normalize、db merge、usage 汇总）。
5. 在预览环境做手动验证：写入一个文件、读取、重命名、删除、usage 汇总正确。

## 验收标准
- `openOpfs()` 可在 Chromium 下工作，首次运行会创建 DB。
- CRUD 全部可用：写入后可读出一致内容；move 后 DB 路径同步；delete 后 DB/文件都不存在。
- `getUsage()` 返回条目数与总 bytes；若支持 `navigator.storage.estimate()` 则带 quota/usage。
- DB 中可保存并更新 `extras` 字段，且不影响后续读取/列表。

