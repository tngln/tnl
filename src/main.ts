import { effect } from "./core/reactivity"
import { createCodecRegistry } from "./core/codecs"
import { ShortcutManager, type ShortcutContextResolver, type ShortcutExecutionContext } from "./core/shortcuts"
import { theme } from "./config/theme"
import { ModalWindow, Root } from "./ui/window/window"
import { WindowManager } from "./ui/window/window_manager"
import { CanvasUI } from "./ui/base/ui"
import { ABOUT_DIALOG_ID, createAboutDialog } from "./ui/window/about_dialog"
import { DEVELOPER_WINDOW_ID } from "./ui/window/developer/developer_tools_window"
import { unionRect } from "./core/rect"
import { TOOLS_DIALOG_ID } from "./ui/window/tools_dialog"
import { TIMELINE_TOOL_WINDOW_ID } from "./ui/window/timeline_tool_window"
import { addBrowserInteractionCancelListener, addWindowKeyDownListener, addWindowKeyUpListener, addWindowLoadListener, addWindowResizeListener, applyDocumentTheme, getRootCanvas, registerServiceWorker, scheduleAnimationFrame } from "./platform/web"
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
  inspector: {
    tree: () => root.debugSnapshot(),
  },
}

type AppShortcutContext = ShortcutExecutionContext & {
  wm: WindowManager
  docking: DockingManager
  codecs: typeof developerContext.codecs
  inspector: NonNullable<typeof developerContext.inspector>
  ui: CanvasUI
}

function targetContextId(target: unknown) {
  if (!target || typeof target !== "object") return null
  const value = (target as { id?: unknown }).id
  return typeof value === "string" && value.length ? value : null
}

const shortcutResolver: ShortcutContextResolver<AppShortcutContext> = {
  resolve(ctx) {
    const contexts: string[] = []
    const captureId = targetContextId(ctx.captureTopLevelTarget)
    const focusId = targetContextId(ctx.focusTopLevelTarget)
    const hoverId = targetContextId(ctx.hoverTopLevelTarget)
    if (captureId) contexts.push(`capture:${captureId}`)
    if (focusId) contexts.push(`focus:${focusId}`)
    if (hoverId) contexts.push(`hover:${hoverId}`)
    if (ctx.activeWindowId) contexts.push(`window:${ctx.activeWindowId}`)
    if (ctx.activePaneId) contexts.push(`pane:${ctx.activePaneId}`)
    if (ctx.activeContainerId) contexts.push(`container:${ctx.activeContainerId}`)
    contexts.push("global")
    return contexts
  },
}

const shortcuts = new ShortcutManager<AppShortcutContext>({
  resolver: shortcutResolver,
  getExecutionContext: () => ({
    wm: windows,
    docking,
    codecs: developerContext.codecs,
    inspector: developerContext.inspector,
    ui,
    activeWindowId: windows.getActiveWindowId(),
    activePaneId: docking.getActivePaneId(),
    activeContainerId: docking.getActiveContainerId(),
    focusTarget: ui.focusTarget,
    focusTopLevelTarget: ui.focusTopLevelTarget,
    hoverTarget: ui.hoverTarget,
    captureTarget: ui.captureTarget,
    hoverTopLevelTarget: ui.hoverTopLevelTarget,
    captureTopLevelTarget: ui.captureTopLevelTarget,
  }),
})

shortcuts.registerCommand({
  id: "app.toggleAbout",
  run(ctx) {
    ctx.wm.toggle(ABOUT_DIALOG_ID)
    const snap = ctx.wm.listWindows().find((entry) => entry.id === ABOUT_DIALOG_ID)
    if (snap?.open && !snap.minimized) ctx.wm.focus(ABOUT_DIALOG_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerCommand({
  id: "workspace.activateDeveloper",
  run(ctx) {
    ctx.docking.activatePane(DEVELOPER_WINDOW_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerCommand({
  id: "workspace.activateTools",
  run(ctx) {
    ctx.docking.activatePane(TOOLS_DIALOG_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerCommand({
  id: "workspace.activateTimeline",
  run(ctx) {
    ctx.docking.activatePane(TIMELINE_TOOL_WINDOW_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerBinding({ command: "app.toggleAbout", context: "global", trigger: { kind: "key-down", code: "F1" } })
shortcuts.registerBinding({ command: "workspace.activateDeveloper", context: "global", trigger: { kind: "key-down", code: "F2" } })
shortcuts.registerBinding({ command: "workspace.activateTools", context: "global", trigger: { kind: "key-down", code: "F3" } })
shortcuts.registerBinding({ command: "workspace.activateTimeline", context: "global", trigger: { kind: "key-down", code: "F4" } })

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

const removeKeyDownListener = addWindowKeyDownListener((event) => {
  const result = ui.handleKeyDown({
    code: event.code,
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  })
  if (result.consumed) {
    shortcuts.syncKeyDown(event)
    if (result.preventDefault) event.preventDefault()
    return
  }
  shortcuts.handleKeyDown(event)
})

const removeKeyUpListener = addWindowKeyUpListener((event) => {
  const result = ui.handleKeyUp({
    code: event.code,
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  })
  if (result.preventDefault) event.preventDefault()
  shortcuts.handleKeyUp(event)
})

const removeShortcutCancelListener = addBrowserInteractionCancelListener(() => {
  ui.clearFocus()
  shortcuts.resetInputState()
})
;(globalThis as any).__TNL_DEVTOOLS__.disposeShortcuts = () => {
  removeKeyDownListener()
  removeKeyUpListener()
  removeShortcutCancelListener()
}

canvas.addEventListener("pointerdown", (event) => {
  shortcuts.handlePointerDown({
    button: event.button,
    buttons: event.buttons,
    x: event.clientX,
    y: event.clientY,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  })
})

canvas.addEventListener("pointerup", (event) => {
  shortcuts.handlePointerUp({
    button: event.button,
    buttons: event.buttons,
    x: event.clientX,
    y: event.clientY,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
  })
})

canvas.addEventListener(
  "wheel",
  (event) => {
    shortcuts.handleWheel({
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      x: event.clientX,
      y: event.clientY,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      preventDefault: () => event.preventDefault(),
    })
  },
  { passive: false },
)

addWindowLoadListener(() => {
  void registerServiceWorker("./sw.js", "./").catch(() => {})
})
