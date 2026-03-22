# Canvas Interface Public API

本文档是 `packages/canvas-interface/package.json` subpath exports 的唯一规范表。

## 核心入口

- `@tnl/canvas-interface`
- `@tnl/canvas-interface/ui`
- `@tnl/canvas-interface/builder`
- `@tnl/canvas-interface/platform/web`
- `@tnl/canvas-interface/developer`
- `@tnl/canvas-interface/docking`
- `@tnl/canvas-interface/widgets`
- `@tnl/canvas-interface/reactivity`
- `@tnl/canvas-interface/draw`
- `@tnl/canvas-interface/layout`
- `@tnl/canvas-interface/theme`
- `@tnl/canvas-interface/jsx`
- `@tnl/canvas-interface/text`

## 低层稳定入口

- `@tnl/canvas-interface/event_stream`
- `@tnl/canvas-interface/fsm`
- `@tnl/canvas-interface/commands`
- `@tnl/canvas-interface/shortcuts`
- `@tnl/canvas-interface/errors`
- `@tnl/canvas-interface/debug`
- `@tnl/canvas-interface/icons`
- `@tnl/canvas-interface/async_state`
- `@tnl/canvas-interface/util`
- `@tnl/canvas-interface/invalidate`

## 约定

- 新入口必须代表稳定、可命名、可长期维护的能力域。
- 仅为少写相对路径而新增 subpath export 是不允许的。
- 已被更粗粒度入口覆盖的薄 wrapper，应优先删除而不是继续公开。
- 文档中其余文件不再重复维护完整入口清单，统一引用本文。
