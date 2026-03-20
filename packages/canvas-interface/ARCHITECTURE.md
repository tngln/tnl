# Canvas Interface Architecture

## Summary

`canvas-interface` is a retained scene-graph UI framework for Canvas hosts.
The runtime is organized around four layers:

1. `UIElement` nodes own geometry, hit testing, cursor resolution, event handlers, and runtime lifecycle.
2. `CanvasUI` translates browser events into framework sessions, dispatches them through the scene graph, and manages dirty-rect rendering.
3. Builder surfaces turn declarative trees into stable retained nodes and pure paint/layout output.
4. Developer tooling reads runtime snapshots rather than inferring state from source.

The framework contract is that every interactive node follows the same rules for activation, deactivation, invalidation, focus, and pointer cancellation.

## Runtime Contract

### Node identity and lifecycle

- Stable identity comes from the caller: builder keys, surface ids, or explicit runtime ids.
- Mounted nodes may be activated and deactivated many times without being recreated.
- `onRuntimeActivate()` is for becoming live inside the retained tree.
- `onRuntimeDeactivate(reason)` is for releasing transient runtime state when the host marks a node inactive.
- Deactivation must clear transient capture, press, drag, menu, and text-input state.

### Geometry and hit testing

- `bounds()` returns the node's current hit-test rectangle in canvas CSS coordinates.
- `hitTest()` descends through children in z-order and returns the deepest active node.
- `cursorAt()` must follow the same visibility and hit boundaries as interaction.
- Nodes may declare a visual invalidation outset through `invalidationOutset()` so repaint padding is part of the contract instead of ad hoc call-site guesses.

### Interaction sessions

- Pointer state lives in `PointerSession`: active pointer id, hover target, capture target, and double-click pairing.
- Focus state lives in `FocusSession`: the currently focused node plus the reason the last focus transition happened.
- Text input stays widget-owned, but widgets must expose runtime session state through debug snapshots.
- Browser cancellation reasons are preserved as `InteractionCancelReason` values and must flow into pointer cancel and runtime deactivation behavior.

### Invalidation and paint

- `invalidateRect()` is the default path; full invalidation is a fallback, not the norm.
- Invalidation requests should carry a source label so developer tooling can explain why a repaint happened.
- Draw ops remain the low-level paint primitive, but retained nodes are responsible for stable paint intent and invalidation bounds.
- Compositor layers may cache by `contentVersion`; unchanged versions must skip repaint.

## Builder Roles

- Primitive paint/layout nodes render directly and should avoid retained interaction state.
- Interactive control nodes use a shared retained runtime contract for hover, press, drag, and deactivation.
- Stateful widget nodes may own additional runtime state, but they still participate in the same activation, invalidation, and debug protocols.
- RetainedRuntime pools both control nodes and widget nodes through one retained-node runtime; `mountControl()` and `mountWidget()` are compatibility helpers over that shared path.
- Builder handlers must declare their runtime class explicitly as `primitive`, `control`, or `widget`; nodes like selectable rich text may resolve that class from props instead of relying on convention.

Builder code should choose among those node classes intentionally instead of creating parallel lifecycle systems.

## Developer Observability

Developer tools should answer these questions without reading source:

- Which node was hit?
- Which path received the event?
- Which node owns focus, hover, and capture?
- Why did a rect invalidate?
- What runtime state does a selected node currently hold?

The runtime therefore exposes:

- scene-graph snapshots through `debugSnapshot()`
- builder declaration snapshots and retained-runtime snapshots side by side for builder surfaces
- per-node runtime fields through `debugRuntimeState()`
- canvas session snapshots through `CanvasUI.debugInteractionState()`
- compositor layer and blit snapshots through existing compositor debug APIs

## Current High-Risk Gaps

- Some widgets still rely on widget-local text-input or menu state instead of shared session abstractions.
- Builder call sites still distinguish `mountWidget()` and `mountControl()` even though the runtime path is now unified.
- Dirty-rect padding is improved by node outsets and source-tagged invalidations, but top-level drag/resize invalidation is still conservative.
