export function getRootCanvas(selector = "#app"): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null
  return document.querySelector<HTMLCanvasElement>(selector)
}

export function applyDocumentTheme(themeColor: string, bodyColor: string) {
  if (typeof document === "undefined") return
  document.body.style.background = bodyColor
  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeMeta) themeMeta.content = themeColor
}

export async function registerServiceWorker(url: string, scope: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  await navigator.serviceWorker.register(url, { scope })
}
