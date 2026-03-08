import { effect } from "./core/reactivity"
import { theme } from "./config/theme"
import { ModalWindow, Root } from "./ui/window/window"
import { WindowManager } from "./ui/window/window_manager"
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
const windows = new WindowManager(root)

const about = new AboutDialog()
windows.register(about)

const developer = new DeveloperToolsWindow({ wm: windows })
windows.register(developer)

const tools = new ToolsDialog()
windows.register(tools)

const timeline = new TimelineToolWindow()
windows.register(timeline)

const ui = new CanvasUI(canvas, root, {
  onTopLevelPointerDown(top) {
    if (top instanceof ModalWindow) windows.onWindowPointerDown(top)
    else top.bringToFront()
  },
})
windows.setCanvasSize(ui.sizeCss)
;(globalThis as any).__TNL_DEVTOOLS__ ??= {}
;(globalThis as any).__TNL_DEVTOOLS__.invalidate = () => ui.invalidate()
const lastRects = new Map<string, { x: number; y: number; w: number; h: number }>()

effect(() => {
  const pad = 24

  for (const snap of windows.listWindows()) {
    const cur = snap.rect
    const prev = lastRects.get(snap.id)
    lastRects.set(snap.id, cur)
    if (!prev) ui.invalidateRect(cur, { pad })
    else ui.invalidateRect(unionRect(prev, cur), { pad })
  }
})

window.addEventListener("resize", () => {
  requestAnimationFrame(() => {
    windows.setCanvasSize(ui.sizeCss)
  })
})

canvas.addEventListener("keydown", (e) => {
  if (e.key !== "F1" && e.key !== "F2" && e.key !== "F3" && e.key !== "F4") return
  e.preventDefault()
  const id =
    e.key === "F1" ? ABOUT_DIALOG_ID : e.key === "F2" ? DEVELOPER_WINDOW_ID : e.key === "F3" ? TOOLS_DIALOG_ID : TIMELINE_TOOL_WINDOW_ID
  windows.toggle(id)
  const snap = windows.listWindows().find((entry) => entry.id === id)
  if (snap?.open && !snap.minimized) windows.focus(id)
  ui.invalidate()
})

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {})
  })
}
