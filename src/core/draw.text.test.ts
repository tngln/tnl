import { describe, expect, it } from "bun:test"
import { fontString, layoutRichText, measureTextWidth } from "./draw.text"

type FakeMeasure = { width: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number }

function fakeCtx() {
  let font = "400 12px system-ui"
  let calls = 0
  const ctx: any = {
    get font() {
      return font
    },
    set font(v: string) {
      font = v
    },
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "#000",
    measureText(text: string): FakeMeasure {
      calls++
      const m = /(\d+(?:\.\d+)?)px/.exec(font)
      const size = m ? parseFloat(m[1]) : 12
      return { width: text.length * size * 0.6, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 }
    },
    fillText() {},
  }
  return { ctx: ctx as CanvasRenderingContext2D, get calls() { return calls } }
}

describe("draw.text", () => {
  it("builds font strings with emphasis", () => {
    const base = { fontFamily: "system-ui", fontSize: 14, fontWeight: 400, lineHeight: 18 }
    expect(fontString(base, {})).toContain("400 14px")
    expect(fontString(base, { bold: true })).toContain("700 14px")
    expect(fontString(base, { italic: true })).toContain("italic ")
  })

  it("caches measureTextWidth by font+text", () => {
    const f = fakeCtx()
    const w1 = measureTextWidth(f.ctx, "hello", "400 12px system-ui")
    const w2 = measureTextWidth(f.ctx, "hello", "400 12px system-ui")
    expect(w2).toBe(w1)
    expect(f.calls).toBe(1)
  })

  it("wraps text by maxWidth", () => {
    const { ctx } = fakeCtx()
    const base = { fontFamily: "system-ui", fontSize: 10, fontWeight: 400, lineHeight: 12, color: "#fff" }
    const spans = [{ text: "hello world" }]
    const layout = layoutRichText(ctx, spans, base, { maxWidth: 40, align: "start" })
    expect(layout.lines.length).toBeGreaterThan(1)
    for (const line of layout.lines) expect(line.w).toBeLessThanOrEqual(40 + 1e-6)
    expect(layout.lines[0]?.runs[0]?.color).toBe("#fff")
  })

  it("splits long tokens when they exceed maxWidth", () => {
    const { ctx } = fakeCtx()
    const base = { fontFamily: "system-ui", fontSize: 10, fontWeight: 400, lineHeight: 12, color: "#fff" }
    const spans = [{ text: "AAAAAAAAAA" }]
    const layout = layoutRichText(ctx, spans, base, { maxWidth: 18, align: "start" })
    expect(layout.lines.length).toBeGreaterThan(1)
    for (const line of layout.lines) expect(line.w).toBeLessThanOrEqual(18 + 1e-6)
  })
})
