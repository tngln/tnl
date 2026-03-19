export function fakeCtx() {
  let font = "400 12px system-ui"
  const calls: Array<{ op: string; args: any[] }> = []
  const ctx: any = {
    canvas: { width: 800, height: 600 },
    calls,
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
    save() { calls.push({ op: "save", args: [] }) },
    restore() { calls.push({ op: "restore", args: [] }) },
    beginPath() { calls.push({ op: "beginPath", args: [] }) },
    rect(...args: any[]) { calls.push({ op: "rect", args }) },
    clip(...args: any[]) { calls.push({ op: "clip", args }) },
    translate(...args: any[]) { calls.push({ op: "translate", args }) },
    roundRect(...args: any[]) { calls.push({ op: "roundRect", args }) },
    fillRect(...args: any[]) { calls.push({ op: "fillRect", args }) },
    strokeRect(...args: any[]) { calls.push({ op: "strokeRect", args }) },
    fill(...args: any[]) { calls.push({ op: "fill", args }) },
    stroke(...args: any[]) { calls.push({ op: "stroke", args }) },
    arc(...args: any[]) { calls.push({ op: "arc", args }) },
    moveTo(...args: any[]) { calls.push({ op: "moveTo", args }) },
    lineTo(...args: any[]) { calls.push({ op: "lineTo", args }) },
    setLineDash(...args: any[]) { calls.push({ op: "setLineDash", args }) },
    fillText(...args: any[]) { calls.push({ op: "fillText", args }) },
    drawImage(...args: any[]) { calls.push({ op: "drawImage", args }) },
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

