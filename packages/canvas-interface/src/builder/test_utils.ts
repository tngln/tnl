export function fakeCtx() {
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

export function withFakeDocument<T>(run: () => T) {
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
    return run()
  } finally {
    ;(globalThis as any).document = prevDocument
  }
}

