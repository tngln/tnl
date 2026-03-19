# Refactor Plan 0319

## 目标

在 `src/` 完全删除、双包边界基本稳定之后，下一阶段不再以“搬文件”为主，而是做三件事：

1. 把 `canvas-interface` 变成真正可长期维护的 framework 包。
2. 继续压缩历史遗留的导出噪音和边界模糊点。
3. 为后续编辑器能力开发准备更稳定的 runtime、文档和样例。

## 当前状态

- `packages/canvas-interface` 已拥有通用 UI / browser / developer / storage 能力。
- `packages/tnl-app` 已主要保留视频编辑与媒体 runtime 能力。
- `src/` 已删除。
- 主工程、子包 typecheck、全量测试都可通过。

这意味着我们已经从“迁移期”进入“整顿期”。

## Phase A：文档与公共 API 收紧

### 目标

让目录、导出、文档三者一致，减少后续再次漂移。

### 工作项

- 审视 `packages/canvas-interface/package.json` 的所有 subpath exports
- 区分“稳定公共入口”与“只是为了内部方便的入口”
- 为公共入口补最小职责说明
- 继续减少不必要的 facade，但不破坏已形成的清晰边界
- 更新主文档，只保留当前有效的路径和示例

### 验收标准

- 新增代码不需要猜测该从哪里 import
- 文档中的路径都指向现有文件
- `canvas-interface` 顶层导出面不再继续无序增长

## Phase B：framework 基础能力补齐

### 目标

把已经归类为 framework 的部分补到“够稳、够解释清楚、够能复用”。

### 工作项

- 为 `canvas-interface` 补一个最小 demo / example
- 评估并补齐通用交互 helper：
  - drag session
  - hover / focus
  - text-input host 边界
- 收敛 Developer 基础面板中的重复结构
- 评估 `invalidateAll()` 的剩余使用点，继续推进局部 invalidation

### 验收标准

- `canvas-interface` 可以脱离 `tnl-app` 展示一个最小窗口/面板 demo
- 基础交互 helper 的复用边界更明确
- Developer 基础面板可以被其它 app 直接复用

## Phase C：`tnl-app` 业务层继续收口

### 目标

在 framework 边界稳定后，继续让 app 侧只保留真正的视频编辑能力。

### 工作项

- 继续检查 `tnl-app` 中是否还有可回归 `canvas-interface` 的通用 UI 能力
- 收紧 app 侧 runtime 公开面：
  - `render`
  - `platform`
  - `playback`
- 为 worker / codec / playback runtime 补更直接的说明文档
- 逐步准备 Project / Sequence / Track / Clip 的业务层落点

### 验收标准

- `tnl-app` 的目录更明显围绕“视频编辑业务”组织
- 新增 app 能力很少再落到 framework 包
- 业务模型的引入不会再次打乱基础层边界

## 建议的近期顺序

1. 先完成文档收敛和公共导出面审视。
2. 再补 `canvas-interface` demo / examples。
3. 然后继续做交互 helper、Developer、invalidation 这几条 framework 质量线。
4. 最后再把精力切到编辑器业务模型。

## 本阶段暂不优先做

- 大规模重写 Builder 模型
- 重新设计插件系统
- 过早扩展更多媒体能力
- 为了“纯粹”而继续做无收益的目录搬迁

## 执行原则

- 小步提交，保持测试绿灯
- 先删过时文档，再写新计划
- 文档只描述当前真实结构，不再保留已经失效的迁移中间态
