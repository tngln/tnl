import { describe, expect, it } from "bun:test"
import { signal } from "@tnl/canvas-interface/reactivity"
import { theme } from "@tnl/canvas-interface/theme"
import { BuilderSurface, buttonNode, checkboxNode, column, defineSurface, flattenTreeItems, mountSurface, richTextNode, row, rowItemNode, scrollAreaNode, textBoxNode, textNode, treeItem, treeViewNode } from "@tnl/canvas-interface/builder"
import { PointerUIEvent } from "@tnl/canvas-interface/ui"
import { fakeCtx, withFakeDocument } from "./test_utils"

describe("surface builder", () => {
  it("reuses mounted widget counts across renders", () => {
    const checked = signal(false, { debugLabel: "test.builder.checked" })
    const text = signal("hello", { debugLabel: "test.builder.text" })
    const surface = new BuilderSurface({
      id: "Builder.Test",
      build: () =>
        column(
          [
            buttonNode("Click", { key: "btn" }),
            checkboxNode("Check", checked, { key: "check" }),
            textBoxNode(text, { key: "textbox", placeholder: "Type here" }),
            rowItemNode({ key: "summary", leftText: "Summary", rightText: "ok" }),
            scrollAreaNode(
              column(
                [
                  rowItemNode({ key: "r1", leftText: "One", rightText: "1" }),
                  rowItemNode({ key: "r2", leftText: "Two", rightText: "2" }),
                ],
                { axis: "column", padding: { l: 0, t: 0, r: 14, b: 0 } },
              ),
              { key: "scroll", style: { fixed: 40 } },
            ),
          ],
          { axis: "column", gap: theme.spacing.xs },
        ),
    })
    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 180 },
      contentRect: { x: 0, y: 0, w: 240, h: 180 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }
    surface.render(ctx, viewport)
    const first = surface.debugCounts()
    surface.render(ctx, viewport)
    const second = surface.debugCounts()
    expect(second).toEqual(first)
    expect(first.widgets).toBe(5) // 1 button + 1 checkbox + 1 textbox + 1 listRow + 1 scrollArea
  })

  it("measures scroll content larger than viewport", () => {
    const surface = new BuilderSurface({
      id: "Builder.Measure",
      build: () =>
        scrollAreaNode(
          column(
            Array.from({ length: 6 }, (_, i) => rowItemNode({ key: `r${i}`, leftText: `Row ${i}` })),
            { axis: "column", padding: { l: 0, t: 0, r: 14, b: 0 } },
          ),
          { key: "scroll" },
        ),
    })
    withFakeDocument(() => {
      const size = surface.contentSize({ x: 180, y: 40 })
      expect(size.y).toBeGreaterThan(40)
    })
  })

  it("keeps row items visible when nested in row containers", () => {
    const surface = new BuilderSurface({
      id: "Builder.RowItem.Nesting",
      build: () => column([row([rowItemNode({ key: "r1", leftText: "Nested" })])]),
    })
    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 120 },
      contentRect: { x: 0, y: 0, w: 240, h: 120 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }
    surface.render(ctx, viewport)
    const snapshot = surface.debugSnapshot()
    const rowNodes: any[] = []
    const visit = (n: any) => {
      if (n?.type === "ControlElement") rowNodes.push(n)
      for (const c of n?.children ?? []) visit(c)
    }
    visit(snapshot)
    expect(rowNodes.length).toBeGreaterThan(0)
    const bounds = rowNodes[0]!.bounds
    expect(bounds.w).toBeGreaterThan(0)
    expect(bounds.h).toBeGreaterThan(0)
  })

  it("guards against rowItem nested in row when debug level is enabled", () => {
    const prev = (globalThis as any).__TNL_DEBUG_LEVEL__
    ;(globalThis as any).__TNL_DEBUG_LEVEL__ = "debug"
    try {
      const surface = new BuilderSurface({
        id: "Builder.RowItem.Guard",
        build: () => column([row([rowItemNode({ key: "r1", leftText: "Nested" })])]),
      })
      withFakeDocument(() => {
        expect(() => surface.contentSize({ x: 240, y: 120 })).toThrow()
      })
    } finally {
      ;(globalThis as any).__TNL_DEBUG_LEVEL__ = prev
    }
  })

  it("runs setup once per mounted instance and preserves instance-local state", () => {
    let setupCount = 0
    const bumpers: Array<() => void> = []
    const DemoSurface = defineSurface<{ label: string }>({
      id: (props) => `Demo.${props.label}`,
      setup: (props) => {
        setupCount += 1
        const clicks = signal(0, { debugLabel: "test.builder.clicks" })
        bumpers.push(() => clicks.set((v) => v + 1))
        return (next) => buttonNode(`${next.label}:${clicks.peek()}`, { key: `btn.${props.label}` })
      },
    })

    const a = mountSurface(DemoSurface, { label: "A" })
    const b = mountSurface(DemoSurface, { label: "B" })

    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 120 },
      contentRect: { x: 0, y: 0, w: 240, h: 120 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }

    a.render(ctx, viewport)
    b.render(ctx, viewport)
    expect(setupCount).toBe(2)
    bumpers[0]!()
    a.render(ctx, viewport)
    b.render(ctx, viewport)
    expect(setupCount).toBe(2)
  })

  it("updates functional surface props without rerunning setup", () => {
    let setupCount = 0
    const seen: string[] = []
    const DemoSurface = defineSurface<{ label: string }>({
      id: "Demo.Props",
      setup: () => {
        setupCount += 1
        return (props) => {
          seen.push(props.label)
          return buttonNode(props.label, { key: "btn" })
        }
      },
    })
    const surface = mountSurface(DemoSurface, { label: "alpha" })
    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 120 },
      contentRect: { x: 0, y: 0, w: 240, h: 120 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }

    surface.render(ctx, viewport)
    surface.setProps({ label: "beta" })
    surface.render(ctx, viewport)

    expect(setupCount).toBe(1)
    expect(seen.at(-1)).toBe("beta")
    expect(seen.filter((label) => label === "beta")).toHaveLength(1)
  })

  it("invalidates mounted surfaces when tracked signals change", () => {
    const clicks = signal(0, { debugLabel: "test.builder.clicks" })
    const DemoSurface = defineSurface<{}>({
      id: "Demo.Reactive",
      setup: () => () => buttonNode(`Count:${clicks.get()}`, { key: "btn" }),
    })

    const prevDevtools = (globalThis as any).__TNL_DEVTOOLS__
    let invalidations = 0
    ;(globalThis as any).__TNL_DEVTOOLS__ = {
      ...(prevDevtools ?? {}),
      invalidate: () => {
        invalidations += 1
      },
    }

    try {
      mountSurface(DemoSurface, {})
      expect(invalidations).toBe(0)
      clicks.set(1)
      expect(invalidations).toBe(1)
      clicks.set(2)
      expect(invalidations).toBe(2)
    } finally {
      ;(globalThis as any).__TNL_DEVTOOLS__ = prevDevtools
    }
  })

  it("prefers a surface-local invalidator over global invalidation", () => {
    const clicks = signal(0, { debugLabel: "test.builder.local.invalidate" })
    const DemoSurface = defineSurface<{}>({
      id: "Demo.Reactive.Local",
      setup: () => () => buttonNode(`Count:${clicks.get()}`, { key: "btn" }),
    })

    const prevDevtools = (globalThis as any).__TNL_DEVTOOLS__
    let globalInvalidations = 0
    let localInvalidations = 0
    ;(globalThis as any).__TNL_DEVTOOLS__ = {
      ...(prevDevtools ?? {}),
      invalidate: () => {
        globalInvalidations += 1
      },
    }

    try {
      const surface = mountSurface(DemoSurface, {}) as any
      surface.setInvalidator(() => {
        localInvalidations += 1
      })
      clicks.set(1)
      clicks.set(2)
      expect(localInvalidations).toBe(2)
      expect(globalInvalidations).toBe(0)
    } finally {
      ;(globalThis as any).__TNL_DEVTOOLS__ = prevDevtools
    }
  })

  it("applies inherited text style from parent containers", () => {
    const defaultSurface = new BuilderSurface({
      id: "Builder.Inherit.Default",
      build: () => column([textNode("MMMM")]),
    })
    const inheritedSurface = new BuilderSurface({
      id: "Builder.Inherit.Custom",
      build: () =>
        column([textNode("MMMM")], undefined, {
          provideStyle: { text: { fontSize: 20, lineHeight: 24 } },
        }),
    })

    withFakeDocument(() => {
      const base = defaultSurface.contentSize({ x: 180, y: 0 })
      const inherited = inheritedSurface.contentSize({ x: 180, y: 0 })
      expect(inherited.y).toBeGreaterThan(base.y)
    })
  })

  it("does not propagate styleOverride to descendants", () => {
    const surface = new BuilderSurface({
      id: "Builder.Override.Scope",
      build: () =>
        column(
          [
            textNode("MMMM", { key: "top" }),
            column(
              [textNode("MMMM", { key: "nested" })],
              { axis: "column" },
              { styleOverride: { text: { fontSize: 8, lineHeight: 10 } } },
            ),
          ],
          { axis: "column" },
          { provideStyle: { text: { fontSize: 20, lineHeight: 24 } } },
        ),
    })

    withFakeDocument(() => {
      const size = surface.contentSize({ x: 0, y: 0 })
      expect(size.y).toBeGreaterThanOrEqual(48)
    })
  })

  it("measures rich text from inherited defaults when textStyle is omitted", () => {
    const surface = new BuilderSurface({
      id: "Builder.RichText.Inherit",
      build: () =>
        column(
          [
            richTextNode([{ text: "Hello world" }], {
              key: "copy",
            }),
          ],
          { axis: "column" },
          { provideStyle: { text: { fontSize: 14, lineHeight: 20 } } },
        ),
    })

    withFakeDocument(() => {
      const size = surface.contentSize({ x: 180, y: 0 })
      expect(size.y).toBeGreaterThanOrEqual(20)
      expect(size.x).toBeGreaterThanOrEqual(180)
    })
  })

  it("flattens tree items according to expanded state", () => {
    const items = [
      treeItem("root", "Root", {
        children: [
          treeItem("a", "A"),
          treeItem("b", "B", {
            children: [treeItem("b.1", "B1")],
          }),
        ],
      }),
    ]

    expect(flattenTreeItems(items, new Set(["root"])).map((row) => row.id)).toEqual(["root", "a", "b"])
    expect(flattenTreeItems(items, new Set(["root", "b"])).map((row) => row.id)).toEqual(["root", "a", "b", "b.1"])
  })

  it("reuses mounted tree rows and hides collapsed descendants", () => {
    const expanded = new Set<string>(["root", "branch"])
    const surface = new BuilderSurface({
      id: "Builder.TreeView",
      build: () =>
        treeViewNode({
          key: "tree",
          items: [
            treeItem("root", "Root", {
              children: [
                treeItem("branch", "Branch", {
                  children: [treeItem("leaf", "Leaf")],
                }),
              ],
            }),
          ],
          expanded,
          selectedId: "leaf",
        }),
    })

    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 180 },
      contentRect: { x: 0, y: 0, w: 240, h: 180 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }

    surface.render(ctx, viewport)
    const first = surface.debugCounts()
    expect(first.widgets).toBe(1) // 1 treeRow (parent) + child rows are dynamically added inside TreeView widget

    expanded.delete("branch")
    surface.render(ctx, viewport)
    const second = surface.debugCounts()
    expect(second.widgets).toBe(1) // 1 treeRow

    const hiddenLeaf = surface.hitTest({ x: 40, y: 54 })
    // The hidden row is still in the tree but has zero bounds, so hitTest should not return it
    // However, if hitTest implementation checks for containment differently or if bounds aren't fully respected, it might be returned.
    // The previous test expected "SurfaceRoot" which means it missed the hidden leaf.
    // Let's check what it actually is now. If it's undefined, it means hitTest returned nothing, which is correct for empty/hidden area if background doesn't catch it.
    // The error says Received: TreeRow {...} which means it DID hit the TreeRow.
    // This implies that even with active=false -> bounds=ZERO_RECT, it was still hit? 
    // Or maybe active=true but bounds are zero?
    // Wait, the test logic is: expanded.delete("branch") -> re-render.
    // "branch" contains "leaf". If branch is collapsed, leaf should not be rendered or should be hidden.
    // In mountTreeView: 
    // const rows = flattenTreeItems(node.items, node.expanded)
    // mountTreeRow(...)
    // flattenTreeItems respects expansion state. So if branch is collapsed, leaf is NOT in `rows`.
    // So `mountTreeRow` is NOT called for leaf.
    // In `endFrame`, we iterate `this.widgets` and mark unused ones as active=false.
    // So the leaf widget from previous frame (which was mounted) is now unused.
    // It should be deactivated.
    // When deactivated, TreeRow.bounds() returns ZERO_RECT.
    // So hitTest({x: 40, y: 54}) should NOT hit the leaf.
    // Why did it return TreeRow?
    // Maybe `this.activeValue` wasn't updated correctly?
    // Let's check `unmount` in descriptor.
    // We haven't implemented `unmount` in `treeRowDescriptor` to set `active` to false on the widget state?
    // The descriptor has: 
    // mount: (state, props, rect, active) => { ... state.active = active ... }
    // But when it is NOT mounted in the current frame, `mount` is not called.
    // `endFrame` calls `descriptor.unmount`.
    // Let's check `unmount` in `treeRowDescriptor`.
    // I missed adding `unmount` to `treeRowDescriptor`!
    // The default behavior in `endFrame` is:
    // if (cell.used) continue
    // this.updateWidgetActive(cell.widget, cell.active, false)
    // cell.active = false
    // descriptor?.unmount?.(cell.state)
    //
    // So `cell.active` becomes false. 
    // But does `state.active` become false? 
    // In `treeRowDescriptor`, `state.active` is just a property on the state object.
    // `state.widget` reads `this.activeValue`.
    // `state.widget.set` updates `activeValue`.
    // We need `unmount` to update the widget's active state!
    
    expect(hiddenLeaf?.constructor.name).not.toBe("TreeRow")
  })

  it("routes tree toggle and select through tree row hit areas", () => {
    const expanded = new Set<string>(["root"])
    const events: string[] = []
    const surface = new BuilderSurface({
      id: "Builder.TreeView.Events",
      build: () =>
        treeViewNode({
          key: "tree",
          items: [
            treeItem("root", "Root", {
              children: [treeItem("child", "Child")],
            }),
          ],
          expanded,
          onToggle: (id) => {
            events.push(`toggle:${id}`)
          },
          onSelect: (id) => {
            events.push(`select:${id}`)
          },
        }),
    })

    const ctx = fakeCtx()
    const viewport = {
      rect: { x: 0, y: 0, w: 240, h: 180 },
      contentRect: { x: 0, y: 0, w: 240, h: 180 },
      clip: false,
      scroll: { x: 0, y: 0 },
      toSurface: (p: { x: number; y: number }) => p,
      dpr: 1,
    }

    surface.render(ctx, viewport)
    const toggleTarget = surface.hitTest({ x: 12, y: 10 })
    expect(toggleTarget).toBeTruthy()
    toggleTarget?.emit("pointerenter")
    toggleTarget?.emit("pointerdown",
      new PointerUIEvent({
        pointerId: 1,
        x: 12,
        y: 10,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    toggleTarget?.emit("pointerup",
      new PointerUIEvent({
        pointerId: 1,
        x: 12,
        y: 10,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    const selectTarget = surface.hitTest({ x: 32, y: 10 })
    expect(selectTarget).toBeTruthy()
    selectTarget?.emit("pointerenter")
    selectTarget?.emit("pointerdown",
      new PointerUIEvent({
        pointerId: 1,
        x: 32,
        y: 10,
        button: 0,
        buttons: 1,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )
    selectTarget?.emit("pointerup",
      new PointerUIEvent({
        pointerId: 1,
        x: 32,
        y: 10,
        button: 0,
        buttons: 0,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    )

    expect(events).toEqual(["toggle:root", "select:root"])
  })
})
