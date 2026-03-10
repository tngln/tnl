import { describe, expect, it } from "bun:test"
import { CanvasUI, KeyUIEvent, PointerUIEvent, UIElement, WheelUIEvent, type Rect } from "./ui"
import { SurfaceRoot, ViewportElement, type Surface } from "./viewport"

class HostElement extends UIElement {
  readonly events: string[] = []

  bounds(): Rect {
    return { x: 0, y: 0, w: 200, h: 200 }
  }

  onPointerDown(e: PointerUIEvent) {
    this.events.push(`down:${e.phase}:${e.target === this ? "self" : "child"}:${e.x},${e.y}`)
  }

  onPointerMove(e: PointerUIEvent) {
    this.events.push(`move:${e.phase}:${e.target === this ? "self" : "child"}:${e.x},${e.y}`)
  }

  onPointerCancel(e: PointerUIEvent | null, reason: string) {
    this.events.push(`cancel:${reason}:${e?.phase ?? "none"}:${e?.target === this ? "self" : "child"}`)
  }

  onWheel(e: WheelUIEvent) {
    this.events.push(`wheel:${e.phase}:${e.target === this ? "self" : "child"}:${e.x},${e.y}:${e.didHandle ? "handled" : "open"}`)
  }
}

class ChildElement extends UIElement {
  readonly events: string[] = []
  stop = false
  captureOnDown = false
  stopKey = false
  focused = false
  blurred = false

  bounds(): Rect {
    return { x: 20, y: 20, w: 40, h: 40 }
  }

  canFocus() {
    return true
  }

  onPointerDown(e: PointerUIEvent) {
    this.events.push(`down:${e.phase}:${e.x},${e.y}`)
    if (this.captureOnDown) e.capturePointer()
    if (this.stop) e.stopPropagation()
  }

  onPointerMove(e: PointerUIEvent) {
    this.events.push(`move:${e.phase}:${e.x},${e.y}`)
  }

  onPointerCancel(_e: PointerUIEvent | null, reason: string) {
    this.events.push(`cancel:${reason}`)
  }

  onFocus() {
    this.focused = true
    this.blurred = false
  }

  onBlur() {
    this.focused = false
    this.blurred = true
  }

  onKeyDown(e: KeyUIEvent) {
    this.events.push(`key:${e.phase}:${e.code}`)
    e.handle()
    if (this.stopKey) e.stopPropagation()
  }
}

class LocalLeaf extends UIElement {
  readonly events: string[] = []
  handleWheel = false
  stopPointer = false
  focused = false

  bounds(): Rect {
    return { x: 0, y: 0, w: 30, h: 30 }
  }

  canFocus() {
    return true
  }

  onFocus() {
    this.focused = true
  }

  onPointerDown(e: PointerUIEvent) {
    this.events.push(`down:${e.phase}:${e.x},${e.y}`)
    if (this.stopPointer) e.stopPropagation()
    e.capturePointer()
  }

  onWheel(e: WheelUIEvent) {
    this.events.push(`wheel:${e.phase}:${e.x},${e.y}`)
    if (this.handleWheel) e.handle()
  }
}

class FocusHostElement extends HostElement {
  onKeyDown(e: KeyUIEvent) {
    this.events.push(`key:${e.phase}:${e.target === this ? "self" : "child"}:${e.code}`)
    e.handle()
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
    globalCompositeOperation: "source-over",
    globalAlpha: 1,
    setTransform() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    fillRect() {},
    clearRect() {},
    translate() {},
    drawImage() {},
  } as unknown as CanvasRenderingContext2D
}

function withFakeDom<T>(run: (canvas: HTMLCanvasElement, windowHost: ReturnType<typeof createListenerHost>) => T) {
  const previousWindow = (globalThis as any).window
  const previousDocument = (globalThis as any).document
  const previousRaf = (globalThis as any).requestAnimationFrame

  const windowHost = createListenerHost()
  const documentHost = Object.assign(createListenerHost(), {
    visibilityState: "visible",
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() {
          return fakeContext()
        },
      }
    },
  })
  const canvasHost = createListenerHost()

  const canvas = Object.assign(canvasHost, {
    width: 0,
    height: 0,
    style: { cursor: "default" },
    getContext() {
      return fakeContext()
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 200 }
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  }) as unknown as HTMLCanvasElement

  ;(globalThis as any).window = Object.assign(windowHost, { devicePixelRatio: 1 })
  ;(globalThis as any).document = documentHost
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  }

  try {
    return run(canvas, windowHost)
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

function wheelEvent(x: number, y: number, deltaY = 10) {
  return {
    clientX: x,
    clientY: y,
    deltaX: 0,
    deltaY,
    deltaZ: 0,
    deltaMode: 0,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    preventDefault() {},
  } as WheelEvent
}

describe("ui event bubbling", () => {
  it("bubbles pointer events from child to parent", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      const child = new ChildElement()
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))

      expect(child.events).toEqual(["down:target:25,25"])
      expect(host.events).toEqual(["down:bubble:child:25,25"])

      ui.destroy()
    })
  })

  it("stops bubbling when the target stops propagation", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      const child = new ChildElement()
      child.stop = true
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))

      expect(child.events).toEqual(["down:target:25,25"])
      expect(host.events).toEqual([])

      ui.destroy()
    })
  })

  it("bubbles cancel and move through captured targets", () => {
    withFakeDom((canvas, windowHost) => {
      const host = new HostElement()
      const child = new ChildElement()
      child.captureOnDown = true
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))
      ;(canvas as any).dispatch("pointermove", pointerEvent(150, 150, 1))
      windowHost.dispatch("blur")

      expect(child.events).toEqual(["down:target:25,25", "move:target:150,150", "cancel:blur"])
      expect(host.events).toEqual(["down:bubble:child:25,25", "move:bubble:child:150,150", "cancel:blur:none:child"])

      ui.destroy()
    })
  })

  it("bridges viewport surface events into bubbling while keeping local coordinates", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      const leaf = new LocalLeaf()
      const root = new SurfaceRoot()
      root.add(leaf)
      const surfaceEvents: string[] = []
      const surface: Surface = {
        id: "test-surface",
        render() {},
        hitTest(p) {
          return root.hitTest(p)
        },
        onPointerDown(e) {
          surfaceEvents.push(`down:${e.phase}:${e.x},${e.y}`)
        },
      }
      const viewport = new ViewportElement({
        rect: () => ({ x: 50, y: 40, w: 100, h: 100 }),
        target: surface,
      })
      host.add(viewport)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(60, 55, 1))

      expect(leaf.events).toEqual(["down:target:10,15"])
      expect(surfaceEvents).toEqual([])
      expect(host.events).toEqual(["down:bubble:child:60,55"])
      expect(ui.focusTarget).toBe(leaf)
      expect(leaf.focused).toBe(true)

      ui.destroy()
    })
  })

  it("preserves surface wheel fallback without double handling", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      const leaf = new LocalLeaf()
      leaf.handleWheel = true
      const root = new SurfaceRoot()
      root.add(leaf)
      let surfaceWheel = 0
      const surface: Surface = {
        id: "wheel-surface",
        render() {},
        hitTest(p) {
          return root.hitTest(p)
        },
        onWheel() {
          surfaceWheel += 1
        },
      }
      const viewport = new ViewportElement({
        rect: () => ({ x: 50, y: 40, w: 100, h: 100 }),
        target: surface,
      })
      host.add(viewport)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("wheel", wheelEvent(60, 55))

      expect(leaf.events).toEqual(["wheel:target:10,15"])
      expect(surfaceWheel).toBe(0)
      expect(host.events).toEqual(["wheel:bubble:child:60,55:handled"])

      ui.destroy()
    })
  })

  it("does not recurse when viewport falls back to the surface bridge on pointer move", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      let surfaceMoves = 0
      const surface: Surface = {
        id: "empty-surface",
        render() {},
        hitTest() {
          return null
        },
        onPointerMove(e) {
          surfaceMoves += 1
          expect(e.phase).toBe("target")
          expect(e.x).toBe(20)
          expect(e.y).toBe(25)
        },
      }
      const viewport = new ViewportElement({
        rect: () => ({ x: 50, y: 40, w: 100, h: 100 }),
        target: surface,
      })
      host.add(viewport)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointermove", pointerEvent(70, 65, 0))

      expect(surfaceMoves).toBe(1)
      expect(host.events).toEqual(["move:bubble:child:70,65"])

      ui.destroy()
    })
  })

  it("focuses the nearest focusable target on pointer down and clears it on empty hit", () => {
    withFakeDom((canvas) => {
      const host = new HostElement()
      const child = new ChildElement()
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))
      expect(ui.focusTarget).toBe(child)
      expect(child.focused).toBe(true)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(180, 180, 1))
      expect(ui.focusTarget).toBe(null)
      expect(child.blurred).toBe(true)

      ui.destroy()
    })
  })

  it("bubbles keyboard events from the focused target to its parent", () => {
    withFakeDom((canvas) => {
      const host = new FocusHostElement()
      const child = new ChildElement()
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))
      const handled = ui.handleKeyDown({
        code: "Enter",
        key: "Enter",
        repeat: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      })

      expect(handled).toEqual({ consumed: true, preventDefault: false })
      expect(child.events).toEqual(["down:target:25,25", "key:target:Enter"])
      expect(host.events).toEqual(["down:bubble:child:25,25", "key:bubble:child:Enter"])

      ui.destroy()
    })
  })

  it("stops keyboard bubbling when the focused target stops propagation", () => {
    withFakeDom((canvas) => {
      const host = new FocusHostElement()
      const child = new ChildElement()
      child.stopKey = true
      host.add(child)
      const ui = new CanvasUI(canvas, host)

      ;(canvas as any).dispatch("pointerdown", pointerEvent(25, 25, 1))
      const handled = ui.handleKeyDown({
        code: "Escape",
        key: "Escape",
        repeat: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      })

      expect(handled).toEqual({ consumed: true, preventDefault: false })
      expect(child.events).toEqual(["down:target:25,25", "key:target:Escape"])
      expect(host.events).toEqual(["down:bubble:child:25,25"])

      ui.destroy()
    })
  })

  it("ignores keyboard dispatch when nothing is focused", () => {
    withFakeDom((canvas) => {
      const host = new FocusHostElement()
      const ui = new CanvasUI(canvas, host)

      const handled = ui.handleKeyDown({
        code: "Space",
        key: " ",
        repeat: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
      })

      expect(handled).toEqual({ consumed: false, preventDefault: false })
      expect(host.events).toEqual([])

      ui.destroy()
    })
  })
})
