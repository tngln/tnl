# UI 系统底层重构建议与计划

## 现状更新
- 本文档是 UI 系统底层重构的初始计划。
- **当前状态：⚠️ 部分实现**
- `BuilderRuntime` 已引入 `WidgetRegistry` 机制
- `InteractiveElement` 仍被大量 widgets 继承
- Signal 驱动的自动 invalidation 尚未完全实现

## 1. 现状诊断与问题分析
经过对 `src/ui/base`, `src/ui/builder`, `src/ui/widgets` 等核心模块的分析，目前的 UI 架构是一个 **混合了保留模式 (Retained Mode) 与声明式 (Declarative) 的 Canvas UI 系统**。

### 核心优势
- **高性能**：基于 Canvas 直接绘制，绕过了 DOM 开销，适合高性能图形/媒体应用。
- **开发效率**：提供了类似 JSX 的声明式 Builder 语法，开发体验较好。
- **能力完备**：已具备布局引擎、事件冒泡、命中测试、Z-Index 管理等基础能力。

### 存在的问题 (部分已解决)
1.  **Runtime 耦合度过高 (部分解决)**
    - `BuilderRuntime` 已引入 `WidgetRegistry` 机制，但仍有部分硬编码逻辑
    - **后果**：每增加一个新 Widget（如 VideoPlayer），都必须修改 Runtime 核心代码。这违反了开闭原则，导致系统难以扩展和维护。

2.  **继承链僵化 (未解决)**
    - 大量 Widget 深度继承自 `InteractiveElement`。
    - **后果**：如果一个组件只需要"点击"而不需要"拖拽"，它依然继承了所有逻辑。且难以复用跨组件的交互逻辑（例如：将"可拖拽"能力赋予一个非 InteractiveElement 的对象）。

3.  **状态管理分散 (部分解决)**
    - 混合了手动 `invalidate()` 和声明式 `Signal`。
    - **后果**：开发者容易忘记调用 `invalidate()` 导致 UI 不刷新，或过度刷新导致性能浪费。

## 2. 重构目标（部分完成）

本次重构的核心目标是 **解耦** 与 **可扩展性**，为后续操作（如增加复杂媒体组件、插件化 UI）打下基础。

1.  **模块化 Widget 系统 (部分完成)**：Runtime 不再感知具体 Widget，通过 **注册表 (Registry)** 动态加载。
2.  **组合式交互能力 (未完成)**：从"继承庞大基类"转向"组合交互行为 (Behaviors)"。
3.  **统一响应式 (未完成)**：全面拥抱 Signal，减少手动 invalidation。

## 3. 详细实施计划（部分完成）

### Phase 1: 核心解耦 - 引入 Widget Registry (部分完成)

**目标**：消灭 `BuilderRuntime` 中的硬编码 Widget Map，改为通用处理。

**步骤**：
1.  **定义 Widget 接口协议**：
    在 `src/ui/builder/registry.ts` 中定义通用的 Widget 生命周期接口：
    ```typescript
    export interface WidgetDescriptor<TProps, TState> {
      id: string; // e.g., "button", "textbox"
      create: (id: string) => TState;
      mount: (state: TState, props: TProps, layout: LayoutNode) => void;
      update: (state: TState, props: TProps) => void; // 响应式更新
      unmount: (state: TState) => void;
      layout?: (props: TProps) => LayoutNode; // 可选的自定义布局逻辑
    }
    ```

2.  **实现 `WidgetRegistry`**：
    创建一个单例注册表，允许各模块注册自己的 Widget Descriptor。

3.  **改造 `BuilderRuntime`**：
    - 删除所有 `private readonly buttons = new Map(...)` 等特定 Map。
    - 替换为 `private readonly widgets = new Map<string, Map<string, any>>()` (Key: widgetType -> (Key: id -> state))。
    - 在 `render` 循环中，根据 AST 节点的类型 (`kind`) 从 Registry 查找对应的 Descriptor 并执行 `mount/update`。

4.  **迁移基础 Widget**：
    将 `Button`, `TextBox`, `Checkbox` 等现有组件重构为符合新接口的独立模块，并在应用启动时注册。

### Phase 2: 交互能力组合化 (Composition API) (未完成)

**目标**：解构 `InteractiveElement`，提供更灵活的交互复用。

**步骤**：
1.  **提取 Behaviors**：
    创建 `src/ui/behaviors/` 目录，实现独立的行为控制器：
    - `Clickable`: 处理 down/up/click 状态机。
    - `Draggable`: 处理 drag start/move/end/cancel。
    - `Focusable`: 处理 focus/blur 与键盘事件分发。
    - `Hoverable`: 处理 pointer enter/leave。

2.  **重构 Widget 实现**：
    Widget 不再继承 `InteractiveElement`，而是持有 Behavior 实例。
    *示例*：
    ```typescript
    class ButtonWidget {
      private clickable = new Clickable({ onClick: ... });
      private hoverable = new Hoverable({ ... });

      onPointerDown(e) { this.clickable.handleDown(e); }
      // ... 转发事件给 behaviors
    }
    ```

### Phase 3: 性能与响应式优化 (长期演进) (未完成)

**目标**：提升大型界面的渲染性能与开发体验。

**步骤**：
1.  **Memoization (渲染缓存)**：
    在 Builder 中引入 `Memo` 节点。如果 Props 浅比较未变化，则直接复用上一次的 Layout 和 Draw 指令，跳过子树构建。

2.  **Signal-driven Invalidation**：
    建立 Signal 与 UI Element 的自动绑定机制。当 Widget 依赖的 Signal 变化时，自动标记该 Widget (及其区域) 为 Dirty，触发布局或重绘，无需手动调用 `invalidate()`。

## 4. 建议的下一步 Action

建议继续推进 **Phase 2 (交互能力组合化)** 的重构。

1.  创建 `src/ui/behaviors/` 目录与基础 Behaviors。
2.  选取一个简单的组件（如 `Button`）作为 Pilot 进行迁移验证。
3.  验证成功后，逐步替换 `InteractiveElement` 的继承链。
