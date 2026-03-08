import { effect } from "./core/reactivity"
import { createCodecRegistry } from "./core/codecs"
import { theme } from "./config/theme"
import { ModalWindow, Root } from "./ui/window/window"
import { WindowManager } from "./ui/window/window_manager"
import { CanvasUI } from "./ui/base/ui"
import { ABOUT_DIALOG_ID, createAboutDialog } from "./ui/window/about_dialog"
import { DEVELOPER_WINDOW_ID } from "./ui/window/developer/developer_tools_window"
import { unionRect } from "./core/rect"
import { TOOLS_DIALOG_ID } from "./ui/window/tools_dialog"
import { TIMELINE_TOOL_WINDOW_ID } from "./ui/window/timeline_tool_window"
import { addWindowLoadListener, addWindowResizeListener, applyDocumentTheme, getRootCanvas, registerServiceWorker, scheduleAnimationFrame } from "./platform/web"
import { DockingManager } from "./ui/docking/manager"
import { createDefaultDockablePanes } from "./ui/docking/default_panes"
import { firstLeaf } from "./ui/docking/model"

const canvas = getRootCanvas("#app")
if (!canvas) throw new Error("Canvas not found")

applyDocumentTheme(theme.colors.appBg, theme.colors.appBg)

const root = new Root()
const windows = new WindowManager(root)
const codecs = createCodecRegistry()
const docking = new DockingManager({ windows })

const about = createAboutDialog()
windows.register(about)

const ui = new CanvasUI(canvas, root, {
  onTopLevelPointerDown(top) {
    if (top instanceof ModalWindow) windows.onWindowPointerDown(top)
    else top.bringToFront()
  },
})
docking.setInvalidate(() => ui.invalidate())

const developerContext = {
  wm: windows,
  docking,
  codecs: {
    info: () => codecs.summary(),
    list: () => codecs.list(),
  },
}

for (const pane of createDefaultDockablePanes(developerContext)) docking.registerPane(pane)
const workspaceId = docking.createContainer()
const firstPaneId = DEVELOPER_WINDOW_ID
docking.dockPane(firstPaneId, workspaceId, null, "center")
const leftLeafId = firstLeaf(docking.getRoot(workspaceId))?.id ?? null
if (leftLeafId) docking.dockPane(TOOLS_DIALOG_ID, workspaceId, leftLeafId, "center")
if (leftLeafId) docking.dockPane(TIMELINE_TOOL_WINDOW_ID, workspaceId, leftLeafId, "right")

windows.setCanvasSize(ui.sizeCss)
;(globalThis as any).__TNL_DEVTOOLS__ ??= {}
;(globalThis as any).__TNL_DEVTOOLS__.invalidate = () => ui.invalidate()
;(globalThis as any).__TNL_DEVTOOLS__.codecs = codecs
;(globalThis as any).__TNL_DEVTOOLS__.docking = docking
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
  if (e.key === "F1") {
    windows.toggle(ABOUT_DIALOG_ID)
    const snap = windows.listWindows().find((entry) => entry.id === ABOUT_DIALOG_ID)
    if (snap?.open && !snap.minimized) windows.focus(ABOUT_DIALOG_ID)
    ui.invalidate()
    return
  }
  const paneId = e.key === "F2" ? DEVELOPER_WINDOW_ID : e.key === "F3" ? TOOLS_DIALOG_ID : TIMELINE_TOOL_WINDOW_ID
  docking.activatePane(paneId)
  ui.invalidate()
})

addWindowLoadListener(() => {
  void registerServiceWorker("./sw.js", "./").catch(() => {})
})
