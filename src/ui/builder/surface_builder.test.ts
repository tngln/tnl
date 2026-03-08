import { describe, expect, it } from "bun:test"
import { signal } from "../../core/reactivity"
import { theme } from "../../config/theme"
import { BuilderSurface, buttonNode, checkboxNode, column, defineSurface, mountSurface, rowItemNode, scrollAreaNode } from "./surface_builder"

function fakeCtx() {
  let font = "400 12px system-ui"
  const ctx: any = {
    canvas: { width: 800, height: 600 },
    get font() {
      return font
    },
    set font(v: string) {
      font = v
    },
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    translate() {},
    roundRect() {},
    fillRect() {},
    strokeRect() {},
    fill() {},
    stroke() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    setLineDash() {},
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
  return ctx as CanvasRenderingContext2D
}

describe("surface builder", () => {
  it("reuses mounted widget counts across renders", () => {
    const checked = signal(false)
    const surface = new BuilderSurface({
      id: "Builder.Test",
      build: () =>
        column(
          [
            buttonNode("Click", { key: "btn" }),
            checkboxNode("Check", checked, { key: "check" }),
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
    const prevDocument = (globalThis as any).document
    ;(globalThis as any).document = {
      createElement() {
        return {
          getContext() {
            return fakeCtx()
          },
        }
      },
    }
    try {
      const size = surface.contentSize({ x: 180, y: 40 })
      expect(size.y).toBeGreaterThan(40)
    } finally {
      ;(globalThis as any).document = prevDocument
    }
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
})
