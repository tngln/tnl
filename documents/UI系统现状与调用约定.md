# UI 系统现状与调用约定

本文只保留默认写法与边界规则。完整入口清单见 [canvas-interface-public-api.md](./canvas-interface-public-api.md)。

## 默认写法

- 普通窗口：`SurfaceWindow` + `surfaceMount(...)` + `defineSurface(...)`
- 普通页面 / 面板：JSX + 声明式组件
- 复杂编辑器区域：类式 `Surface` 或多个 `ViewportElement`

## 声明式 UI 约定

- JSX 不是 React；当前只支持函数组件、`Fragment`、基础富文本 intrinsic
- `defineSurface({ setup })` 中，`setup(...)` 只执行一次，后续变化从 `render(props)` 读取
- 局部 `signal`、缓存对象、局部集合放在 `setup`

## 平台边界

- 浏览器能力从 `@tnl/canvas-interface/platform/web` 进入
- 普通 UI 文件不要直接读取 `window`、`document`、`navigator`
- 视频编辑 / 媒体 runtime 能力留在 `@tnl/app/platform`

## 一句规则

- 页面像应用面板：用 `defineSurface + JSX`
- 页面像编辑器控件：用类式 `Surface + ViewportElement`
