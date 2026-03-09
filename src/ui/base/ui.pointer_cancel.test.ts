import { describe, expect, it } from "bun:test"
import { CanvasUI, CursorRegion, PointerUIEvent, UIElement, type Rect } from "./ui"

class CaptureElement extends UIElement {
  moves = 0
  cancels: string[] = []
  focused = false
  blurred = false

  bounds(): Rect {
    return { x: 0, y: 0, w: 80, h: 80 }
  }

  canFocus() {
    return true
  }

  onPointerDown(e: PointerUIEvent) {
    e.capture()
  }

  onPointerMove() {
    this.moves += 1
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: string) {
    this.cancels.push(reason)
  }

  onFocus() {
    this.focused = true
    this.blurred = false
  }

  onBlur() {
    this.focused = false
    this.blurred = true
  }
}

class RootElement extends UIElement {
  constructor(child: UIElement) {
    super()
    this.add(child)
  }

  bounds(): Rect {
    return { x: -1000, y: -1000, w: 2000, h: 2000 }
  }
}

class CursorElement extends UIElement {
  constructor(bounds: Rect, cursor: "ew-resize" | "nwse-resize") {
    super()
    this.add(
      new CursorRegion({
        rect: () => bounds,
        cursor,
      }),
    )
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

class ParentCaptureElement extends UIElement {
  constructor() {
    super()
    const childHost = new NestedCursorHost()
    childHost.z = 1
    this.add(childHost)
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }

  onPointerDown(e: PointerUIEvent) {
    e.capturePointer()
  }
}

class NestedCursorHost extends UIElement {
  constructor() {
    super()
    this.add(
      new CursorRegion({
        rect: () => ({ x: 70, y: 70, w: 20, h: 20 }),
        cursor: "nwse-resize",
      }),
    )
  }

  bounds(): Rect {
    return { x: 70, y: 70, w: 20, h: 20 }
  }
}

class OverlappingCursorElement extends UIElement {
  constructor() {
    super()
    const lower = new CursorRegion({
      rect: () => ({ x: 10, y: 10, w: 40, h: 40 }),
      cursor: "ew-resize",
    })
    lower.z = 1
    const higher = new CursorRegion({
      rect: () => ({ x: 10, y: 10, w: 40, h: 40 }),
      cursor: "nwse-resize",
    })
    higher.z = 2
    this.add(lower)
    this.add(higher)
  }

  bounds(): Rect {
    return { x: 0, y: 0, w: 100, h: 100 }
  }
}

type ListenerMap = Map<string, Set<(event: any) => void>>

function createListenerHost() {
  const listeners: ListenerMap = new Map()
  return {
    listeners,
    addEventListener(type: string, listener: (event: any) => void) {
      let bucket = listeners.get(type)
      if (!bucket) {
        bucket = new Set()
        listeners.set(type, bucket)
      }
      bucket.add(listener)
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type: string, event: any = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

function fakeContext() {
  return {
    setTransform() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
  } as unknown as CanvasRenderingContext2D
}

function withFakeDom<T>(run: (ctx: {
  canvas: HTMLCanvasElement
  windowHost: ReturnType<typeof createListenerHost>
  documentHost: ReturnType<typeof createListenerHost> & { visibilityState: string }
}) => T) {
  const previousWindow = (globalThis as any).window
  const previousDocument = (globalThis as any).document
  const previousRaf = (globalThis as any).requestAnimationFrame

  const windowHost = createListenerHost()
  const documentBase = createListenerHost()
  const documentHost = Object.assign(documentBase, { visibilityState: "visible" })
  const canvasHost = createListenerHost()
  let capturedPointerId: number | null = null
  let releasedPointerId: number | null = null

  const canvas = Object.assign(canvasHost, {
    width: 0,
    height: 0,
    style: { cursor: "default" },
    getContext() {
      return fakeContext()
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 120 }
    },
    setPointerCapture(pointerId: number) {
      capturedPointerId = pointerId
    },
    releasePointerCapture(pointerId: number) {
      releasedPointerId = pointerId
    },
  }) as unknown as HTMLCanvasElement

  ;(globalThis as any).window = Object.assign(windowHost, { devicePixelRatio: 1 })
  ;(globalThis as any).document = documentHost
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  }

  try {
    return run({
      canvas: Object.assign(canvas, {
        __capturedPointerId: () => capturedPointerId,
        __releasedPointerId: () => releasedPointerId,
      }) as HTMLCanvasElement,
      windowHost,
      documentHost,
    })
  } finally {
    ;(globalThis as any).window = previousWindow
    ;(globalThis as any).document = previousDocument
    ;(globalThis as any).requestAnimationFrame = previousRaf
  }
}

function pointerEvent(x: number, y: number, buttons: number) {
  return {
    pointerId: 1,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  } as PointerEvent
}

describe("canvas ui pointer cancel", () => {
  it("cancels active capture on pointercancel and clears capture", () => {
    withFakeDom(({ canvas, windowHost }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointercancel", pointerEvent(10, 10, 0))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect(target.cancels).toEqual(["pointercancel"])
      expect(target.moves).toBe(0)
      expect((canvas as any).__releasedPointerId()).toBe(1)

      ui.destroy()
      windowHost.dispatch("blur")
    })
  })

  it("cancels active capture on browser blur and removes listeners on destroy", () => {
    withFakeDom(({ canvas, windowHost }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      expect(ui.focusTarget).toBe(target)
      windowHost.dispatch("blur")
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect(target.cancels).toEqual(["blur"])
      expect(target.moves).toBe(0)
      expect(target.blurred).toBe(true)
      expect(ui.focusTarget).toBe(null)

      ui.destroy()
      windowHost.dispatch("blur")
      expect(target.cancels).toEqual(["blur"])
    })
  })

  it("applies cursor from hovered cursor regions and restores default when leaving", () => {
    withFakeDom(({ canvas }) => {
      const root = new RootElement(new CursorElement({ x: 20, y: 20, w: 30, h: 30 }, "ew-resize"))
      const ui = new CanvasUI(canvas, root)

      ;(canvas as any).dispatch("pointermove", pointerEvent(25, 25, 0))
      expect((canvas as any).style.cursor).toBe("ew-resize")

      ;(canvas as any).dispatch("pointermove", pointerEvent(160, 25, 0))
      expect((canvas as any).style.cursor).toBe("default")

      ui.destroy()
    })
  })

  it("prefers the top-most cursor region when regions overlap", () => {
    withFakeDom(({ canvas }) => {
      const ui = new CanvasUI(canvas, new RootElement(new OverlappingCursorElement()))

      ;(canvas as any).dispatch("pointermove", pointerEvent(20, 20, 0))
      expect((canvas as any).style.cursor).toBe("nwse-resize")

      ui.destroy()
    })
  })

  it("keeps the active cursor during capture and resets on destroy", () => {
    withFakeDom(({ canvas }) => {
      const target = new CaptureElement()
      target.add(
        new CursorRegion({
          rect: () => ({ x: 0, y: 0, w: 80, h: 80 }),
          cursor: "nwse-resize",
        }),
      )
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))
      expect((canvas as any).style.cursor).toBe("nwse-resize")

      ui.destroy()
      expect((canvas as any).style.cursor).toBe("default")
    })
  })

  it("clears focus on destroy", () => {
    withFakeDom(({ canvas }) => {
      const target = new CaptureElement()
      const ui = new CanvasUI(canvas, new RootElement(target))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      expect(ui.focusTarget).toBe(target)

      ui.destroy()

      expect(target.blurred).toBe(true)
      expect(ui.focusTarget).toBe(null)
    })
  })

  it("does not adopt a descendant cursor when a parent capture target has no capture cursor", () => {
    withFakeDom(({ canvas }) => {
      const ui = new CanvasUI(canvas, new RootElement(new ParentCaptureElement()))

      ;(canvas as any).dispatch("pointerdown", pointerEvent(10, 10, 1))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 10, 1))

      expect((canvas as any).style.cursor).toBe("default")

      ui.destroy()
    })
  })
})
