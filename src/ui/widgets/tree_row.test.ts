import { describe, expect, it } from "bun:test"
import { PointerUIEvent } from "../base/ui"
import { TREE_ROW_DISCLOSURE_SLOT, TREE_ROW_HEIGHT, TREE_ROW_INDENT_STEP, TreeRow } from "./tree_row"

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
  const lines: Array<[number, number, number, number]> = []
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
    fill() {},
    stroke() {},
    setLineDash() {},
    moveTo(x: number, y: number) {
      lines.push([x, y, x, y])
    },
    lineTo(x: number, y: number) {
      const last = lines[lines.length - 1]
      if (last) {
        last[2] = x
        last[3] = y
      }
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
  return { ctx: ctx as CanvasRenderingContext2D, lines }
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

    row.onPointerEnter()
    row.onPointerDown(pointer(24, 10))
    row.onPointerUp(pointer(24, 10))

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

    row.onPointerEnter()
    row.onPointerDown(pointer(40, 10))
    row.onPointerUp(pointer(40, 10))

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

    row.onPointerEnter()
    row.onPointerDown(pointer(10, 10))
    row.onPointerUp(pointer(10, 10))

    expect(toggles).toBe(0)
    expect(selects).toBe(1)
  })

  it("draws disclosure glyph orientation for expanded and collapsed states", () => {
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

    expect(expandedDraw.lines[0]?.[0]).toBeLessThan(expandedDraw.lines[0]?.[2] ?? 0)
    expect(collapsedDraw.lines[0]?.[1]).toBeLessThan(collapsedDraw.lines[0]?.[3] ?? 0)
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
})
