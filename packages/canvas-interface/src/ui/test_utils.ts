export type ListenerHost = ReturnType<typeof createListenerHost>

type ListenerMap = Map<string, Set<(event: any) => void>>

export function createListenerHost() {
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

export function fakeContext() {
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

export function withFakeDom<T>(
  opts: Partial<{
    canvasRect: { width: number; height: number }
    includeDocumentCreateElement: boolean
    trackPointerCapture: boolean
  }>,
  run: (ctx: { canvas: HTMLCanvasElement; windowHost: ListenerHost; documentHost: ListenerHost & { visibilityState: string } }) => T,
) {
  const { canvasRect, includeDocumentCreateElement = true, trackPointerCapture = false } = opts
  const previousWindow = (globalThis as any).window
  const previousDocument = (globalThis as any).document
  const previousRaf = (globalThis as any).requestAnimationFrame

  const windowHost = createListenerHost()
  const documentBase = createListenerHost()
  const documentHost = Object.assign(documentBase, { visibilityState: "visible" as const }) as ListenerHost & { visibilityState: string }
  if (includeDocumentCreateElement) {
    Object.assign(documentHost, {
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
  }

  const canvasHost = createListenerHost()
  let capturedPointerId: number | null = null
  let releasedPointerId: number | null = null

  const rect = canvasRect ?? { width: 200, height: 200 }
  const canvas = Object.assign(canvasHost, {
    width: 0,
    height: 0,
    style: { cursor: "default" },
    getContext() {
      return fakeContext()
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: rect.width, height: rect.height }
    },
    setPointerCapture(pointerId: number) {
      if (!trackPointerCapture) return
      capturedPointerId = pointerId
    },
    releasePointerCapture(pointerId: number) {
      if (!trackPointerCapture) return
      releasedPointerId = pointerId
    },
    __capturedPointerId: () => capturedPointerId,
    __releasedPointerId: () => releasedPointerId,
  }) as unknown as HTMLCanvasElement

  ;(globalThis as any).window = Object.assign(windowHost, { devicePixelRatio: 1 })
  ;(globalThis as any).document = documentHost
  ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  }

  try {
    return run({ canvas, windowHost, documentHost })
  } finally {
    ;(globalThis as any).window = previousWindow
    ;(globalThis as any).document = previousDocument
    ;(globalThis as any).requestAnimationFrame = previousRaf
  }
}

export function pointerEvent(x: number, y: number, buttons: number) {
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

export function wheelEvent(x: number, y: number, deltaY = 10) {
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

