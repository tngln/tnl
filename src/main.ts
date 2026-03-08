import { effect } from "./core/reactivity"
import { createCodecRegistry } from "./core/codecs"
import { theme } from "./config/theme"
import { ModalWindow, Root } from "./ui/window/window"
import { WindowManager } from "./ui/window/window_manager"
import { CanvasUI } from "./ui/base/ui"
import { ABOUT_DIALOG_ID, createAboutDialog } from "./ui/window/about_dialog"
import { DEVELOPER_WINDOW_ID, createDeveloperToolsWindow } from "./ui/window/developer/developer_tools_window"
import { unionRect } from "./core/rect"
import { TOOLS_DIALOG_ID, createToolsDialog } from "./ui/window/tools_dialog"
import { TIMELINE_TOOL_WINDOW_ID, createTimelineToolWindow } from "./ui/window/timeline_tool_window"
import { addWindowLoadListener, addWindowResizeListener, applyDocumentTheme, getRootCanvas, registerServiceWorker, scheduleAnimationFrame } from "./platform/web"

const canvas = getRootCanvas("#app")
if (!canvas) throw new Error("Canvas not found")

applyDocumentTheme(theme.colors.appBg, theme.colors.appBg)

const root = new Root()
const windows = new WindowManager(root)
const codecs = createCodecRegistry()

const about = createAboutDialog()
windows.register(about)

const developer = createDeveloperToolsWindow({
  wm: windows,
  codecs: {
    info: () => codecs.summary(),
    list: () => codecs.list(),
  },
})
windows.register(developer)

const tools = createToolsDialog()
windows.register(tools)

const timeline = createTimelineToolWindow()
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
;(globalThis as any).__TNL_DEVTOOLS__.codecs = codecs
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

addWindowResizeListener(() => {
  scheduleAnimationFrame(() => {
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

addWindowLoadListener(() => {
  void registerServiceWorker("./sw.js", "./").catch(() => {})
})
