import { describe, expect, it } from "bun:test"
import { columnLayout, createLayoutContext, layout, measureLayout, rowLayout, type LayoutNode } from "@tnl/canvas-interface/layout"

function leaf(id: string, w: number, h: number, style?: LayoutNode["style"]): LayoutNode {
  return {
    id,
    style,
    measure: () => ({ w, h }),
  }
}

describe("layout", () => {
  it("layouts row with gap and padding", () => {
    const root: LayoutNode = {
      style: { axis: "row", gap: 10, padding: 10 },
      children: [leaf("a", 50, 10), leaf("b", 60, 10)],
    }
    layout(root, { x: 0, y: 0, w: 200, h: 100 })
    expect(root.children?.[0].rect).toEqual({ x: 10, y: 10, w: 50, h: 80 })
    expect(root.children?.[1].rect).toEqual({ x: 70, y: 10, w: 60, h: 80 })
  })

  it("distributes grow on remaining space", () => {
    const root: LayoutNode = {
      style: { axis: "row", gap: 0, padding: 0 },
      children: [
        leaf("a", 20, 10, { grow: 1 }),
        leaf("b", 20, 10, { grow: 3 }),
      ],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 10 })
    expect(root.children?.[0].rect?.w).toBeCloseTo(35, 6)
    expect(root.children?.[1].rect?.w).toBeCloseTo(65, 6)
  })

  it("shrinks when overflow", () => {
    const root: LayoutNode = {
      style: { axis: "row", gap: 0, padding: 0 },
      children: [
        leaf("a", 80, 10, { shrink: 1 }),
        leaf("b", 80, 10, { shrink: 1 }),
      ],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 10 })
    expect(root.children?.[0].rect?.w).toBeCloseTo(50, 6)
    expect(root.children?.[1].rect?.w).toBeCloseTo(50, 6)
  })

  it("supports column axis and align center", () => {
    const root: LayoutNode = {
      style: { axis: "column", gap: 0, padding: 0, align: "center" },
      children: [leaf("a", 10, 20), leaf("b", 30, 10)],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 100 })
    expect(root.children?.[0].rect).toEqual({ x: 45, y: 0, w: 10, h: 20 })
    expect(root.children?.[1].rect).toEqual({ x: 35, y: 20, w: 30, h: 10 })
  })

  it("supports fixed sizing with grow and basis shorthands", () => {
    const root: LayoutNode = {
      style: { axis: "row" },
      children: [
        leaf("a", 10, 10, { fixed: 24 }),
        leaf("b", 10, 10, { grow: 1, basis: 0 }),
      ],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 20 })
    expect(root.children?.[0].rect).toEqual({ x: 0, y: 0, w: 24, h: 20 })
    expect(root.children?.[1].rect).toEqual({ x: 24, y: 0, w: 76, h: 20 })
  })

  it("stretches cross axis via alignSelf stretch", () => {
    const root: LayoutNode = {
      style: { axis: "row", align: "start" },
      children: [leaf("a", 10, 10, { alignSelf: "stretch" })],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 40 })
    expect(root.children?.[0].rect).toEqual({ x: 0, y: 0, w: 10, h: 40 })
  })

  it("supports inset and child margin", () => {
    const root: LayoutNode = {
      style: { axis: "column", inset: 4 },
      children: [leaf("a", 20, 10, { margin: { l: 3, t: 2, r: 1, b: 0 } })],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 40 })
    expect(root.children?.[0].rect).toEqual({ x: 7, y: 6, w: 88, h: 10 })
  })

  it("supports rowGap in column flow", () => {
    const root: LayoutNode = {
      style: { axis: "column", rowGap: 8 },
      children: [
        leaf("a", 10, 12),
        leaf("mid", 20, 5, { alignSelf: "end" }),
        leaf("b", 10, 12),
      ],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 60 })
    expect(root.children?.[0].rect).toEqual({ x: 0, y: 0, w: 100, h: 12 })
    expect(root.children?.[1].rect).toEqual({ x: 80, y: 20, w: 20, h: 5 })
    expect(root.children?.[2].rect).toEqual({ x: 0, y: 33, w: 100, h: 12 })
  })

  it("supports stack axis", () => {
    const root: LayoutNode = {
      style: { axis: "stack" },
      children: [
        leaf("base", 40, 20, { alignSelf: "start" }),
        leaf("overlay", 10, 10, { alignSelf: "end" }),
      ],
    }
    layout(root, { x: 0, y: 0, w: 100, h: 50 })
    expect(root.children?.[0].rect).toEqual({ x: 0, y: 0, w: 40, h: 20 })
    expect(root.children?.[1].rect).toEqual({ x: 90, y: 40, w: 10, h: 10 })
  })

  it("reuses measurement results when context is shared", () => {
    let measureCalls = 0
    const root: LayoutNode = {
      style: { axis: "row" },
      children: [
        {
          measure: () => {
            measureCalls += 1
            return { w: 20, h: 10 }
          },
        },
      ],
    }

    const context = createLayoutContext()
    expect(measureLayout(root, { w: 100, h: 50 }, context)).toEqual({ w: 20, h: 10 })
    layout(root, { x: 0, y: 0, w: 100, h: 50 }, context)

    expect(measureCalls).toBe(1)
    expect(root.children?.[0].rect).toEqual({ x: 0, y: 0, w: 20, h: 50 })
  })

  it("provides row helper for fixed and flexible slices", () => {
    const [left, gutter, right] = rowLayout(
      { x: 10, y: 20, w: 100, h: 30 },
      [{ fixed: 40 }, { fixed: 10 }, { flex: 1 }],
    )

    expect(left).toEqual({ x: 10, y: 20, w: 40, h: 30 })
    expect(gutter).toEqual({ x: 50, y: 20, w: 10, h: 30 })
    expect(right).toEqual({ x: 60, y: 20, w: 50, h: 30 })
  })

  it("provides column helper with padding and gap", () => {
    const [header, body] = columnLayout(
      { x: 0, y: 0, w: 80, h: 50 },
      [{ fixed: 12 }, { flex: 1 }],
      { padding: { l: 4, t: 2, r: 6, b: 8 }, gap: 3 },
    )

    expect(header).toEqual({ x: 4, y: 2, w: 70, h: 12 })
    expect(body).toEqual({ x: 4, y: 17, w: 70, h: 25 })
  })
})
