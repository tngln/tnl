import type { InteractionCancelReason } from "../../core/event_stream"

export type CursorKind =
  | "default"
  | "pointer"
  | "grab"
  | "grabbing"
  | "move"
  | "text"
  | "crosshair"
  | "ew-resize"
  | "ns-resize"
  | "nesw-resize"
  | "nwse-resize"
  | "col-resize"
  | "row-resize"
  | "not-allowed"
  | "wait"
  | "progress"

export function setElementPointerCapture(element: { setPointerCapture?: (pointerId: number) => void }, pointerId: number) {
  element.setPointerCapture?.(pointerId)
}

export function releaseElementPointerCapture(element: { releasePointerCapture?: (pointerId: number) => void }, pointerId: number) {
  element.releasePointerCapture?.(pointerId)
}

export function addLostPointerCaptureListener(
  element: {
    addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
    removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
  },
  listener: (pointerId: number) => void,
) {
  if (!element.addEventListener || !element.removeEventListener) return () => {}
  const onLostCapture = (event: Event) => {
    const pointerId = typeof (event as PointerEvent).pointerId === "number" ? (event as PointerEvent).pointerId : 0
    listener(pointerId)
  }
  element.addEventListener("lostpointercapture", onLostCapture)
  return () => element.removeEventListener?.("lostpointercapture", onLostCapture)
}

export function addBrowserInteractionCancelListener(listener: (reason: InteractionCancelReason) => void) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {}

  const onBlur = () => listener("blur")
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") listener("visibility-hidden")
  }
  const onPageHide = () => listener("pagehide")

  window.addEventListener("blur", onBlur)
  document.addEventListener("visibilitychange", onVisibilityChange)
  window.addEventListener("pagehide", onPageHide)

  return () => {
    window.removeEventListener("blur", onBlur)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    window.removeEventListener("pagehide", onPageHide)
  }
}

export function addWindowKeyDownListener(listener: (event: KeyboardEvent) => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("keydown", listener)
  return () => window.removeEventListener("keydown", listener)
}

export function addWindowKeyUpListener(listener: (event: KeyboardEvent) => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("keyup", listener)
  return () => window.removeEventListener("keyup", listener)
}

export function setElementCursor(element: { style?: { cursor: string } }, cursor: CursorKind) {
  if (!element.style) return
  element.style.cursor = cursor
}

export function resetElementCursor(element: { style?: { cursor: string } }) {
  setElementCursor(element, "default")
}
