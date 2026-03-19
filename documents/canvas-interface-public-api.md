# Canvas Interface Public API

本文档用于约束 `packages/canvas-interface/package.json` 的 subpath exports。

目标不是把入口做得越多越好，而是让入口稳定、可解释、可长期维护。

## 核心稳定入口

这些入口已经是明确的 package API，允许 `tnl-app` 和未来其它 app 直接依赖：

- `@tnl/canvas-interface`
- `@tnl/canvas-interface/reactivity`
- `@tnl/canvas-interface/draw`
- `@tnl/canvas-interface/layout`
- `@tnl/canvas-interface/ui`
- `@tnl/canvas-interface/theme`
- `@tnl/canvas-interface/builder`
- `@tnl/canvas-interface/jsx`
- `@tnl/canvas-interface/browser`
- `@tnl/canvas-interface/developer`
- `@tnl/canvas-interface/docking`
- `@tnl/canvas-interface/surfaces`
- `@tnl/canvas-interface/widgets`

## 低层稳定入口

这些入口也是公开 API，但更偏底层能力；新增依赖前应先确认是否真的需要直接暴露在 app 层：

- `@tnl/canvas-interface/event_stream`
- `@tnl/canvas-interface/fsm`
- `@tnl/canvas-interface/commands`
- `@tnl/canvas-interface/shortcuts`
- `@tnl/canvas-interface/errors`
- `@tnl/canvas-interface/debug`
- `@tnl/canvas-interface/drag_drop`
- `@tnl/canvas-interface/viewport`
- `@tnl/canvas-interface/compositor`
- `@tnl/canvas-interface/window`
- `@tnl/canvas-interface/window_manager`
- `@tnl/canvas-interface/icons`
- `@tnl/canvas-interface/util`
- `@tnl/canvas-interface/invalidate`

保留这些入口的原因是：

- 已经有现存消费者
- 它们代表清晰的低层 framework 能力
- 强行折叠回大入口会让依赖关系更含混

## 当前不再鼓励的做法

- 为了省一个相对路径就新增新的 subpath export
- 把内部整理用的目录直接暴露成 package API
- 重新引入只做 `export * from ...` 的历史桥接层

## 新增 export 的判断规则

只有满足以下至少一条时，才考虑新增 subpath export：

1. 它代表一块明确、可命名、可长期稳定的能力域
2. 已经被多个 package 或未来多个 app 作为独立入口消费
3. 折叠进现有入口会明显恶化边界表达

如果只是内部实现细分，应优先保留为目录内相对导入，而不是继续扩张 public API。
