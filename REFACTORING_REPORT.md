# Canvas Interface Refactoring Report

> Deep refactoring of the TNL canvas-based UI infrastructure.
> Focus: reduce duplication, convert OOP patterns to declarative/functional, improve maintainability.

## Summary

| Metric | Value |
|---|---|
| Commits | 7 |
| Files changed | 24 |
| Lines added | 315 |
| Lines deleted | 438 |
| **Net reduction** | **−123 lines** |
| Tests | 38 pass / 0 fail (93 expects) |

---

## Phase 1: Shared Widget Utilities

**Commit:** `f063396` — *extract shared InteractiveElement, toGetter, ZERO_RECT, invalidateAll*

### Problem
`Button`, `Checkbox`, and `Radio` each duplicated ~30 lines of identical interactive state management (`hover`, `down`, `_rect`, `_active`, `_disabled`, `onPointerEnter/Leave/Down/Up`, `bounds()`).

### Changes
- **New file `src/ui/widgets/interactive.ts`** — `InteractiveElement extends UIElement` base class with shared pointer interaction, `interactive()` guard, `onActivate()` template method.
- **New constant `ZERO_RECT`** in `src/core/rect.ts` — frozen `{ x: 0, y: 0, w: 0, h: 0 }` replacing ad-hoc zero rect constructors.
- **New utility `toGetter<T>()`** in `src/core/rect.ts` — normalizes `T | (() => T)` options to `() => T`, replacing identical patterns in Button/Label.
- **New file `src/ui/invalidate.ts`** — centralizes `invalidateAll()` previously duplicated in `codec_panel.tsx` and `storage_panel.tsx`.
- Refactored **Button**, **Checkbox**, **Radio**, **Label**, **Paragraph** to use these shared utilities.

### Files Modified
- `src/core/rect.ts` — added `ZERO_RECT`, `toGetter`
- `src/ui/widgets/interactive.ts` — **new**
- `src/ui/invalidate.ts` — **new**
- `src/ui/widgets/button.ts` — extends `InteractiveElement`
- `src/ui/widgets/checkbox.ts` — extends `InteractiveElement`
- `src/ui/widgets/radio.ts` — extends `InteractiveElement`
- `src/ui/widgets/label.ts` — uses `toGetter`, `ZERO_RECT`
- `src/ui/widgets/paragraph.ts` — uses `ZERO_RECT`
- `src/ui/widgets/index.ts` — exports `InteractiveElement`
- `src/ui/window/developer/panels/codec_panel.tsx` — uses centralized `invalidateAll`
- `src/ui/window/developer/panels/storage_panel.tsx` — uses centralized `invalidateAll`

---

## Phase 2: DRY normalizeChildren

**Commit:** `b969cc4` — *DRY normalizeChildren with resolveChildren/resolveTextContent helpers*

### Problem
Every JSX component in `components.tsx` repeated the verbose pattern:
```ts
normalizeChildren(
  Array.isArray(props.children) ? props.children
    : props.children !== undefined ? [props.children] : []
)
```

### Changes
- **Added `resolveChildren(props)` and `resolveTextContent(props)`** helpers to `src/ui/jsx.ts`.
- **Replaced ~10 instances** of the verbose pattern in `components.tsx` with clean single-call helpers.

### Files Modified
- `src/ui/jsx.ts` — added `resolveChildren`, `resolveTextContent`
- `src/ui/builder/components.tsx` — simplified all component bodies

---

## Phase 3: TextSurface → defineSurface

**Commit:** `44f5d8b` — *convert TextSurface class to defineSurface declarative pattern*

### Problem
`TextSurface` was a 44-line OOP class manually calling `createRichTextBlock`, `draw()`, and managing measure context — all infrastructure already provided by the builder system.

### Changes
- **Replaced** the `TextSurface` class with a `defineSurface` + JSX declaration (~26 lines).
- Renamed `text_surface.ts` → `text_surface.tsx` for JSX support.
- Added drop-in `TextSurface()` factory function so call sites use `TextSurface({...})` instead of `new TextSurface({...})`.

### Files Modified
- `src/ui/surfaces/text_surface.ts` → `src/ui/surfaces/text_surface.tsx` — rewritten
- `src/ui/window/tools_dialog.ts` — removed `new` keyword from 3 `TextSurface` calls

---

## Phase 4: Window Definitions → Factory Functions

**Commit:** `0c1e33f` — *convert window definitions from classes to factory functions*

### Problem
`AboutDialog`, `ToolsDialog`, `TimelineToolWindow`, and `DeveloperToolsWindow` were classes extending `SurfaceWindow` with constructor-only implementations — no methods, no overrides, just configuration.

### Changes
- **Converted all 4** from `class Foo extends SurfaceWindow` to `function createFoo(): SurfaceWindow`.
- Updated `main.ts` imports and call sites.

### Files Modified
- `src/ui/window/about_dialog.tsx` — `class` → `createAboutDialog()`
- `src/ui/window/tools_dialog.ts` — `class` → `createToolsDialog()`
- `src/ui/window/timeline_tool_window.ts` — `class` → `createTimelineToolWindow()`
- `src/ui/window/developer/developer_tools_window.ts` — `class` → `createDeveloperToolsWindow()`
- `src/main.ts` — updated imports and instantiations

---

## Phase 5: CodecRuntimeRegistry → Closure Factory

**Commit:** `17c46d1` — *convert CodecRuntimeRegistry class to createCodecRegistry factory*

### Problem
`CodecRuntimeRegistry` was a thin class wrapping a `Map` — a natural fit for a closure-based factory.

### Changes
- **Replaced** `class CodecRuntimeRegistry` with `function createCodecRegistry()`.
- `CodecRuntimeRegistry` type is now `ReturnType<typeof createCodecRegistry>` for backward compatibility.
- Updated `main.ts` and `codecs.test.ts`.

### Files Modified
- `src/core/codecs.ts` — class → factory function
- `src/core/codecs.test.ts` — updated instantiation
- `src/main.ts` — updated import and call

---

## Phase 6: TabButton → InteractiveElement

**Commit:** `f3edea4` — *convert TabButton to use InteractiveElement base class*

### Problem
`TabButton` in `tab_panel_surface.ts` duplicated the same hover/down/pointer-enter/leave/down/up boilerplate already extracted into `InteractiveElement`.

### Changes
- **Refactored** `TabButton` to extend `InteractiveElement`, using `onActivate()` instead of manual pointer tracking.
- Removed unused `PointerUIEvent` import.

### Files Modified
- `src/ui/surfaces/tab_panel_surface.ts` — TabButton extends InteractiveElement

---

## Phase 7: Inline rectZero() Wrapper

**Commit:** `a0c1eac` — *inline rectZero() wrapper with direct ZERO_RECT usage*

### Problem
`surface_builder.ts` had a trivial `rectZero()` wrapper function that just returned `ZERO_RECT`. It was called 10 times.

### Changes
- **Replaced** all 10 `rectZero()` calls with direct `ZERO_RECT` references.
- **Removed** the `rectZero()` function.

### Files Modified
- `src/ui/builder/surface_builder.ts` — inlined ZERO_RECT, removed wrapper

---

## Architectural Notes

### What was NOT changed (and why)
- **`DividerHandle`** — Has custom drag logic (`onPointerMove` with offset tracking) that doesn't fit the `onActivate()` template. Different interaction paradigm.
- **`CloseButton` / `MinimizeButton` / `ResizeHandle`** — Tightly coupled to window chrome via `instanceof` checks in `isInTitleBar()`. Converting these would require restructuring the window system.
- **`Scrollbar`** — Has a unique drag-with-offset pattern similar to DividerHandle. Not a good fit for InteractiveElement.
- **`Row` widget** — Has a mutable `set()` pattern rather than constructor-configured state. Different lifecycle model.

### Patterns Established
1. **`InteractiveElement`** — Base class for click-style interactive widgets. Extend and override `onActivate()`.
2. **`toGetter<T>()`** — Normalizes `T | (() => T)` to `() => T` for flexible widget option values.
3. **`ZERO_RECT`** — Single frozen zero-rect constant, eliminating per-call allocations.
4. **`resolveChildren()` / `resolveTextContent()`** — JSX child normalization without boilerplate.
5. **Factory functions over constructor-only classes** — `createFoo()` returning a configured instance is simpler than a subclass with no overrides.
6. **`defineSurface` preferred over class-based Surface** — Declarative JSX setup over manual draw calls.
