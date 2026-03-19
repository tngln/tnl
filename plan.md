project: tnl
mode: plan
target: packages-first architecture, canvas UI, web-first runtime

---

# 当前总判断

项目已经完成了一轮大的结构重排：

- 基础框架能力集中到 `packages/canvas-interface`
- 视频编辑与媒体 runtime 集中到 `packages/tnl-app`
- 历史 `src/` 目录已经删除

因此，当前主线不再是“大规模迁移文件”，而是：

1. 收紧 framework 的公共 API 和文档。
2. 补 framework 级 demo、说明和边界规则。
3. 在稳定边界上继续推进 app 的业务模型与媒体能力。

# 现阶段优先级

## Priority 1：收紧 `canvas-interface`

- 统一公共入口与目录结构
- 删除剩余无价值文档噪音
- 为 framework 能力补最小 demo / examples
- 继续减少全局 invalidation 依赖

## Priority 2：完善 Developer / Runtime 观测

- 保持 Developer 基础面板属于 `canvas-interface`
- app 继续通过显式 panel 数组贡献 `Worker` / `Codec` 等页面
- 继续补 runtime registry、状态解释和调试可见性

## Priority 3：准备编辑器业务模型

- 在不破坏边界的前提下引入 `Project / Sequence / Track / Clip`
- 让 timeline 更直接地消费真实业务模型
- 保持 render / playback / codec 仍然属于 `tnl-app`

# 当前边界约定

## `packages/canvas-interface`

负责：

- 响应式、绘制、布局、UI runtime
- Builder / JSX / widgets / surfaces
- 通用 browser 能力
- OPFS 与 Storage 这类 framework 级能力
- Developer 窗口与基础面板

## `packages/tnl-app`

负责：

- 视频编辑业务模型
- playback / webcodecs / media formats / render runtime
- app 专用窗口与面板
- app 对 framework 的组合与装配

# 下一步建议

1. 先完成当前文档收敛。
2. 再补 `canvas-interface` demo。
3. 然后继续处理 helper、invalidation、Developer runtime 质量。
4. 最后再切入更实质的编辑器业务能力。
