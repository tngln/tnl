import { describe, expect, it } from "bun:test"
import { layout, type LayoutNode } from "./layout"

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
})

