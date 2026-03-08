export function scheduleAnimationFrame(cb: FrameRequestCallback) {
  return requestAnimationFrame(cb)
}

export function addWindowResizeListener(listener: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("resize", listener)
  return () => window.removeEventListener("resize", listener)
}

export function addWindowLoadListener(listener: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener("load", listener)
  return () => window.removeEventListener("load", listener)
}
