import { effect } from "./core/reactivity"
import { theme } from "./config/theme"
import { Root, type ModalWindow } from "./ui/window/window"
import { CanvasUI } from "./ui/base/ui"
import { ABOUT_DIALOG_ID, AboutDialog } from "./ui/window/about_dialog"
import { DEVELOPER_WINDOW_ID, DeveloperToolsWindow } from "./ui/window/developer/developer_tools_window"
import { unionRect } from "./core/rect"
import { TOOLS_DIALOG_ID, ToolsDialog } from "./ui/window/tools_dialog"
import { TIMELINE_TOOL_WINDOW_ID, TimelineToolWindow } from "./ui/window/timeline_tool_window"

const canvas = document.querySelector<HTMLCanvasElement>("#app")
if (!canvas) throw new Error("Canvas not found")

document.body.style.background = theme.colors.appBg
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
if (themeMeta) themeMeta.content = theme.colors.appBg

const root = new Root()
const windows = new Map<string, ModalWindow>()

const about = new AboutDialog()
windows.set(about.id, about)
root.add(about)

const developer = new DeveloperToolsWindow()
windows.set(developer.id, developer)
root.add(developer)

const tools = new ToolsDialog()
windows.set(tools.id, tools)
root.add(tools)

const timeline = new TimelineToolWindow()
windows.set(timeline.id, timeline)
root.add(timeline)

const ui = new CanvasUI(canvas, root)
;(globalThis as any).__TNL_DEVTOOLS__ ??= {}
;(globalThis as any).__TNL_DEVTOOLS__.invalidate = () => ui.invalidate()
const lastRects = new Map<string, { x: number; y: number; w: number; h: number }>()

effect(() => {
  const pad = 24

  for (const win of windows.values()) {
    win.open.get()
    win.minimized.get()
    win.x.get()
    win.y.get()
    win.w.get()
    win.h.get()
    const cur = win.bounds()
    const prev = lastRects.get(win.id)
    lastRects.set(win.id, cur)
    if (!prev) ui.invalidateRect(cur, { pad })
    else ui.invalidateRect(unionRect(prev, cur), { pad })
  }
})

canvas.addEventListener("keydown", (e) => {
  if (e.key !== "F1" && e.key !== "F2" && e.key !== "F3" && e.key !== "F4") return
  e.preventDefault()
  const id =
    e.key === "F1" ? ABOUT_DIALOG_ID : e.key === "F2" ? DEVELOPER_WINDOW_ID : e.key === "F3" ? TOOLS_DIALOG_ID : TIMELINE_TOOL_WINDOW_ID
  const win = windows.get(id)
  if (!win) return
  win.open.set((v) => !v)
  if (win.open.peek()) win.bringToFront()
  ui.invalidate()
})

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {})
  })
}
