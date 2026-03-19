import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "@tnl/canvas-interface/ui"
import { chevronDownIcon, chevronRightIcon } from "@tnl/canvas-interface/icons"
import { TREE_ROW_DISCLOSURE_SLOT, TREE_ROW_HEIGHT, TREE_ROW_INDENT_STEP, TreeRow, treeRowDisclosureIcon } from "@tnl/canvas-interface/widgets"

function pointer(x: number, y: number) {
  return new PointerUIEvent({
    pointerId: 1,
    x,
    y,
    button: 0,
    buttons: 1,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  })
}

function fakeCtx() {
  let font = "400 12px system-ui"
  const fills: any[] = []
  const ctx: any = {
    get font() {
      return font
    },
    set font(v: string) {
      font = v
    },
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    fill(path?: any) {
      fills.push(path ?? null)
    },
    stroke() {},
    setLineDash() {},
    moveTo(x: number, y: number) {
    },
    lineTo(x: number, y: number) {
    },
    fillText() {},
    measureText(text: string) {
      const m = /(\d+(?:\.\d+)?)px/.exec(font)
      const size = m ? parseFloat(m[1]) : 12
      return { width: text.length * size * 0.6, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 }
    },
    getTransform() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    },
  }
  return { ctx: ctx as CanvasRenderingContext2D, fills }
}

describe("tree row", () => {
  it("toggles only when clicking disclosure area", () => {
    let toggles = 0
    let selects = 0
    const row = new TreeRow()
    row.set(
      {
        rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
        depth: 1,
        expandable: true,
        expanded: false,
        leftText: "Node",
      },
      {
        onToggle: () => {
          toggles += 1
        },
        onSelect: () => {
          selects += 1
        },
      },
    )

    row.emit("pointerenter")
    row.emit("pointerdown", pointer(24, 10))
    row.emit("pointerup", pointer(24, 10))

    expect(toggles).toBe(1)
    expect(selects).toBe(0)
  })

  it("selects when clicking outside disclosure area", () => {
    let toggles = 0
    let selects = 0
    const row = new TreeRow()
    row.set(
      {
        rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
        depth: 0,
        expandable: true,
        expanded: true,
        leftText: "Node",
      },
      {
        onToggle: () => {
          toggles += 1
        },
        onSelect: () => {
          selects += 1
        },
      },
    )

    row.emit("pointerenter")
    row.emit("pointerdown", pointer(40, 10))
    row.emit("pointerup", pointer(40, 10))

    expect(toggles).toBe(0)
    expect(selects).toBe(1)
  })

  it("does not toggle leaf rows", () => {
    let toggles = 0
    let selects = 0
    const row = new TreeRow()
    row.set(
      {
        rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
        depth: 0,
        expandable: false,
        expanded: false,
        leftText: "Leaf",
      },
      {
        onToggle: () => {
          toggles += 1
        },
        onSelect: () => {
          selects += 1
        },
      },
    )

    row.emit("pointerenter")
    row.emit("pointerdown", pointer(10, 10))
    row.emit("pointerup", pointer(10, 10))

    expect(toggles).toBe(0)
    expect(selects).toBe(1)
  })

  it("draws disclosure glyph orientation for expanded and collapsed states", () => {
    expect(treeRowDisclosureIcon(true)).toBe(chevronDownIcon)
    expect(treeRowDisclosureIcon(false)).toBe(chevronRightIcon)

    const expanded = new TreeRow()
    expanded.set({
      rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
      depth: 0,
      expandable: true,
      expanded: true,
      leftText: "Node",
    })
    const expandedDraw = fakeCtx()
    expanded.draw(expandedDraw.ctx)

    const collapsed = new TreeRow()
    collapsed.set({
      rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
      depth: 0,
      expandable: true,
      expanded: false,
      leftText: "Node",
    })
    const collapsedDraw = fakeCtx()
    collapsed.draw(collapsedDraw.ctx)

    expect(expandedDraw.fills.length).toBeGreaterThan(0)
    expect(collapsedDraw.fills.length).toBeGreaterThan(0)
  })

  it("positions disclosure area according to depth", () => {
    const row = new TreeRow()
    row.set({
      rect: { x: 10, y: 4, w: 200, h: TREE_ROW_HEIGHT },
      depth: 2,
      expandable: true,
      expanded: false,
      leftText: "Node",
    })

    expect(row.disclosureRect()).toEqual({
      x: 10 + 8 + 2 * TREE_ROW_INDENT_STEP,
      y: 4 + Math.floor((TREE_ROW_HEIGHT - TREE_ROW_DISCLOSURE_SLOT) / 2),
      w: TREE_ROW_DISCLOSURE_SLOT,
      h: TREE_ROW_DISCLOSURE_SLOT,
    })
  })

  it("requests invalidation when hover state changes", () => {
    let invalidations = 0
    const row = new TreeRow()
    row.set({
      rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
      depth: 0,
      expandable: true,
      expanded: false,
      leftText: "Node",
    })

    row.draw(fakeCtx().ctx, {
      frameId: 1,
      dpr: 1,
      invalidateRect: () => {
        invalidations += 1
      },
    })

    row.emit("pointerenter")
    row.emit("pointerleave")

    expect(invalidations).toBe(2)
  })

  it("does not draw after being deactivated", () => {
    const row = new TreeRow()
    row.set({
      rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
      depth: 0,
      expandable: true,
      expanded: false,
      leftText: "Node",
    })

    const before = fakeCtx()
    row.draw(before.ctx)
    expect(before.fills.length).toBeGreaterThan(0)

    row.set({
      rect: { x: 0, y: 0, w: 180, h: TREE_ROW_HEIGHT },
      depth: 0,
      expandable: true,
      expanded: false,
      leftText: "Node",
    }, undefined, false)

    const after = fakeCtx()
    row.draw(after.ctx)
    expect(after.fills.length).toBe(0)
  })
})
