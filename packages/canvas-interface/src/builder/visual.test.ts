import { describe, expect, it } from "bun:test"
import { drawVisualNode, measureVisualNode, type VisualNode } from "@tnl/canvas-interface/builder"
import { fakeCtx } from "./test_utils"

describe("visual fragments", () => {
  it("measures Box row layouts with padding", () => {
    const ctx = fakeCtx()
    const visual: VisualNode = {
      kind: "box",
      style: {
        base: {
          layout: { axis: "row", gap: 6, padding: { left: 8, right: 8, top: 4, bottom: 4 } },
        },
      },
      children: [
        { kind: "image", source: { kind: "glyph", text: "+" }, style: { base: { image: { width: 14, height: 14 }, layout: { fixedW: 14, fixedH: 14 } } } },
        { kind: "text", text: "Hello", style: { base: { text: { fontSize: 12, lineHeight: 18 } } } },
      ],
    }

    const size = measureVisualNode(ctx, visual, { w: 200, h: 100 }, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
    })

    expect(size.w).toBeGreaterThan(50)
    expect(size.h).toBeGreaterThanOrEqual(18)
  })

  it("applies variants in order for hover state", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }
    const visual: VisualNode = {
      kind: "text",
      text: "Hover",
      style: {
        base: { text: { color: "#111111" } },
        hover: { text: { color: "#abcdef" } },
      },
    }

    drawVisualNode(ctx, visual, { x: 0, y: 0, w: 80, h: 20 }, {
      state: { hover: true, pressed: false, dragging: false, disabled: false },
    })

    expect((ctx as any).fillStyle).toBe("#abcdef")
  })

  it("draws glyph and bitmap image sources through the shared renderer", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }
    const bitmap = {} as CanvasImageSource
    drawVisualNode(ctx, {
      kind: "box",
      style: { base: { layout: { axis: "row", gap: 4 } } },
      children: [
        { kind: "image", source: { kind: "glyph", text: "*" }, style: { base: { image: { width: 14, height: 14 } } } },
        { kind: "image", source: { kind: "bitmap", image: bitmap }, style: { base: { image: { width: 16, height: 16 } } } },
      ],
    }, { x: 0, y: 0, w: 60, h: 20 }, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
    })

    expect(ctx.calls.some((call) => call.op === "fillText" && call.args[0] === "*")).toBe(true)
    expect(ctx.calls.some((call) => call.op === "drawImage")).toBe(true)
  })

  it("keeps trailing text inside bounds when flexible leading text must grow or shrink", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }
    drawVisualNode(ctx, {
      kind: "box",
      style: { base: { layout: { axis: "row", align: "center", justify: "between", gap: 6 } } },
      children: [
        {
          kind: "text",
          text: "Primary label that is intentionally long enough to need truncation in a narrow row",
          style: {
            base: {
              text: { lineHeight: 20, truncate: true },
              layout: { grow: true, minH: 20 },
            },
          },
        },
        {
          kind: "text",
          text: "Meta",
          style: {
            base: {
              text: { lineHeight: 20, align: "end", truncate: true },
              layout: { minH: 20 },
            },
          },
        },
      ],
    }, { x: 0, y: 0, w: 200, h: 20 }, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
    })

    const trailingTextCalls = ctx.calls.filter((call) => call.op === "fillText" && call.args[0] === "Meta")
    const trailingText = trailingTextCalls[trailingTextCalls.length - 1]
    expect(trailingText).toBeDefined()
    expect(trailingText?.args[1]).toBe(200)
  })

  it("draws line primitives for check-style marks", () => {
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }
    const visual: VisualNode = {
      kind: "box",
      children: [
        { kind: "line", from: { x: 0.25, y: 0.55 }, to: { x: 0.45, y: 0.75 }, style: { base: { line: { color: "#fff", width: 2, cap: "round" } } } },
        { kind: "line", from: { x: 0.45, y: 0.75 }, to: { x: 0.82, y: 0.3 }, style: { base: { line: { color: "#fff", width: 2, cap: "round" } } } },
      ],
    }

    drawVisualNode(ctx, visual, { x: 0, y: 0, w: 16, h: 16 }, {
      state: { hover: false, pressed: false, dragging: false, disabled: false },
    })

    expect(ctx.calls.filter((call) => call.op === "lineTo").length).toBeGreaterThanOrEqual(2)
  })
})
