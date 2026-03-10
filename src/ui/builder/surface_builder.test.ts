import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"
import { BuilderSurface, buttonNode, checkboxNode, column, defineSurface, flattenTreeItems, mountSurface, richTextNode, rowItemNode, scrollAreaNode, textBoxNode, textNode, treeItem, treeViewNode } from "./surface_builder"
import { PointerUIEvent } from "../base/ui"
import { fakeCtx, withFakeDocument } from "./test_utils"

describe("surface builder", () => {
  it("reuses mounted widget counts across renders", () => {
    const checked = signal(false)
    const text = signal("hello")
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
    expect(first.buttons).toBe(1)
    expect(first.checkboxes).toBe(1)
    expect(first.textboxes).toBe(1)
    expect(first.rows).toBe(1)
    expect(first.scrollAreas).toBe(1)
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

  it("runs setup once per mounted instance and preserves instance-local state", () => {
    let setupCount = 0
    const bumpers: Array<() => void> = []
    const DemoSurface = defineSurface<{ label: string }>({
      id: (props) => `Demo.${props.label}`,
      setup: (props) => {
        setupCount += 1
        const clicks = signal(0)
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
    expect(seen).toEqual(["alpha", "beta"])
  })

  it("applies inherited text style from parent containers", () => {
    const defaultSurface = new BuilderSurface({
      id: "Builder.Inherit.Default",
      build: () => column([textNode("MMMM")], { axis: "column" }),
    })
    const inheritedSurface = new BuilderSurface({
      id: "Builder.Inherit.Custom",
      build: () =>
        column([textNode("MMMM")], { axis: "column" }, {
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
    expect(first.treeRows).toBe(3)

    expanded.delete("branch")
    surface.render(ctx, viewport)
    const second = surface.debugCounts()
    expect(second.treeRows).toBe(3)

    const hiddenLeaf = surface.hitTest({ x: 40, y: 54 })
    expect(hiddenLeaf?.constructor.name).toBe("SurfaceRoot")
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
    toggleTarget?.onPointerEnter()
    toggleTarget?.onPointerDown(
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
    toggleTarget?.onPointerUp(
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
    selectTarget?.onPointerEnter()
    selectTarget?.onPointerDown(
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
    selectTarget?.onPointerUp(
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
