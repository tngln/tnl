# Refactor Plan 0316 Review

## 结论

`0316` 这一轮重构的主目标已经基本完成，而且完成度高于原计划：

- `src/` 已被完全删除，历史兼容桥不再保留。
- 通用 UI / Browser / Storage / Developer 能力已经收敛到 `packages/canvas-interface`。
- 视频编辑、媒体运行时、render / codec / worker 等 app 专用能力已经收敛到 `packages/tnl-app`。
- `tnl-app` 通过 `@tnl/canvas-interface/*` 的公开入口消费基础能力。
- `canvas-interface` 顶层大量仅作 re-export 的 bridge 文件已进一步清理，目录结构更规律。

## 已完成的边界调整

### `canvas-interface`

现在归属于 `packages/canvas-interface` 的内容包括：

- 响应式与通用运行时：`reactivity`、`event_stream`、`fsm`、`commands`、`shortcuts`
- 绘制与布局：`draw`、`layout`、`theme`
- UI runtime：`ui`、`viewport`、`window`、`window_manager`、`top_layer`、`drag_drop`、`compositor`
- 高层 authoring：`builder`、`jsx`、`widgets`、`surfaces`
- 浏览器通用能力：`browser`、`platform/web/*`
- Developer 基础设施：Developer 窗口、默认面板、通用调试类型

### `tnl-app`

现在归属于 `packages/tnl-app` 的内容包括：

- 媒体/平台专用能力：`platform/web/playback`、`webcodecs`、`media_formats`、`video_duration`
- 播放与业务会话：`playback`、`ui/playback/*`
- render runtime：`render/*`、`render/proxy/*`
- app 专用开发者面板：`Worker`、`Codec`
- timeline 与视频编辑相关窗口/界面

## 完成度评估

### 已完成

- 包边界重建
- `src/` 目录清零
- Developer 窗口基础能力迁入 `canvas-interface`
- `Storage` 作为 framework 能力回归 `canvas-interface`
- app 通过显式 panel array 贡献 Developer 扩展页
- tests 基本跟随实现文件共置
- `canvas-interface` 内部目录初步分组完成
- 大量顶层 bridge 文件已删除或下沉到各目录 `index.ts`

### 部分完成

- 文档体系仍有旧路径与旧阶段描述残留
- `canvas-interface` 的公共 API 仍可继续收紧
- 一些通用交互 helper 仍可继续抽象
- app 运行时与 framework runtime 的解释性文档仍偏弱

### 未完成

- `canvas-interface` 最小 demo / examples
- 边界约束自动化检查
- 更明确的“新增能力该放哪一侧”的文档化规则

## 当前判断

到今天为止，这一轮“拆包与归属重排”可以认为已经收尾。接下来的工作不应继续停留在“大搬家”，而应进入更稳定的第二阶段：

1. 收紧 `canvas-interface` 的公开 API 与目录约定。
2. 补真正长期有用的文档、示例与边界规则。
3. 继续做小而稳的 runtime / builder / developer 质量优化。

## 关闭说明

`plan-refactor-0316.md` 从现在开始不再作为执行中计划，而是作为这一轮重构的收官复盘文档保留。
