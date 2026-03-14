import { effect } from "./core/reactivity"
import { createLogger } from "./core/debug"
import { invariant, toErrorInfo } from "./core/errors"
import { createCodecRegistry } from "./core/codecs"
import { workerRegistry } from "./core/workers"
import { ShortcutManager, type ShortcutContextResolver, type ShortcutExecutionContext } from "./core/shortcuts"
import { theme } from "./config/theme"
import { ModalWindow, Root } from "./ui/base/window"
import { WindowManager } from "./ui/base/window_manager"
import { CanvasUI } from "./ui/base/ui"
import { ABOUT_DIALOG_ID, createAboutDialog } from "./ui/windows/about_dialog"
import { DEVELOPER_WINDOW_ID } from "./ui/windows/developer/developer_tools_window"
import { EXPLORER_WINDOW_ID } from "./ui/windows/explorer_window"
import { PLAYBACK_TOOL_WINDOW_ID } from "./ui/windows/playback_tool_window"
import { TIMECODE_TOOL_WINDOW_ID } from "./ui/windows/timecode_tool_window"
import { unionRect, type Rect } from "./core/rect"
import { TOOLS_DIALOG_ID } from "./ui/windows/tools_dialog"
import { TIMELINE_TOOL_WINDOW_ID } from "./ui/windows/timeline_tool_window"
import { addBrowserInteractionCancelListener, addWindowErrorListener, addWindowKeyDownListener, addWindowKeyUpListener, addWindowLoadListener, addWindowResizeListener, addWindowUnhandledRejectionListener, applyDocumentTheme, getRootCanvas, registerServiceWorker, scheduleAnimationFrame } from "./platform/web"
import { DockingManager } from "./ui/docking/manager"
import { createDefaultDockablePanes } from "./ui/docking/default_panes"
import { findLeafByPane, firstLeaf } from "./ui/docking/model"

const canvas = getRootCanvas("#app")
invariant(canvas, {
  domain: "app",
  code: "CanvasNotFound",
  message: "Canvas not found",
  details: { selector: "#app" },
})

const appLog = createLogger("app")
appLog.info("Initializing application")

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
  workers: {
    info: () => workerRegistry.summary(),
    list: () => workerRegistry.list(),
  },
  surface: {
    listLayers: () => ui.debugCompositorLayers(),
    listBlits: () => ui.debugCompositorFrameBlits(),
    setOverlay: (rect: Rect | null) => ui.setDebugOverlay(rect),
    setPaintFlash: (on: boolean) => ui.setDebugPaintFlash(on),
    getPaintFlash: () => ui.isDebugPaintFlashEnabled(),
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
  id: "workspace.activateExplorer",
  run(ctx) {
    ctx.docking.activatePane(EXPLORER_WINDOW_ID)
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

shortcuts.registerCommand({
  id: "workspace.activatePlayback",
  run(ctx) {
    ctx.docking.activatePane(PLAYBACK_TOOL_WINDOW_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerCommand({
  id: "workspace.activateTimecode",
  run(ctx) {
    ctx.docking.activatePane(TIMECODE_TOOL_WINDOW_ID)
    ctx.ui.invalidate()
  },
})

shortcuts.registerBinding({ command: "app.toggleAbout", context: "global", trigger: { kind: "key-down", code: "F1" } })
shortcuts.registerBinding({ command: "workspace.activateDeveloper", context: "global", trigger: { kind: "key-down", code: "F2" } })
shortcuts.registerBinding({ command: "workspace.activateExplorer", context: "global", trigger: { kind: "key-down", code: "F7" } })
shortcuts.registerBinding({ command: "workspace.activateTools", context: "global", trigger: { kind: "key-down", code: "F3" } })
shortcuts.registerBinding({ command: "workspace.activateTimeline", context: "global", trigger: { kind: "key-down", code: "F4" } })
shortcuts.registerBinding({ command: "workspace.activatePlayback", context: "global", trigger: { kind: "key-down", code: "F5" } })
shortcuts.registerBinding({ command: "workspace.activateTimecode", context: "global", trigger: { kind: "key-down", code: "F6" } })

for (const pane of createDefaultDockablePanes(developerContext)) docking.registerPane(pane)
const workspaceId = docking.createContainer()
const firstPaneId = DEVELOPER_WINDOW_ID
docking.dockPane(firstPaneId, workspaceId, null, "center")
const leftLeafId = firstLeaf(docking.getRoot(workspaceId))?.id ?? null
if (leftLeafId) docking.dockPane(TOOLS_DIALOG_ID, workspaceId, leftLeafId, "center")
if (leftLeafId) docking.dockPane(EXPLORER_WINDOW_ID, workspaceId, leftLeafId, "center")
if (leftLeafId) docking.dockPane(TIMELINE_TOOL_WINDOW_ID, workspaceId, leftLeafId, "right")
const timelineLeafId = findLeafByPane(docking.getRoot(workspaceId), TIMELINE_TOOL_WINDOW_ID)?.id ?? null
if (timelineLeafId) docking.dockPane(PLAYBACK_TOOL_WINDOW_ID, workspaceId, timelineLeafId, "bottom")
docking.floatPane(TIMECODE_TOOL_WINDOW_ID, { x: 980, y: 48, w: 320, h: 150 })

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
const removeWindowErrorListener = addWindowErrorListener((event) => {
  appLog.error("Unhandled window error", {
    message: event.message,
    filename: event.filename,
    line: event.lineno,
    column: event.colno,
    error: toErrorInfo(event.error),
  })
})
const removeUnhandledRejectionListener = addWindowUnhandledRejectionListener((event) => {
  appLog.error("Unhandled promise rejection", {
    reason: toErrorInfo(event.reason),
  })
})
;(globalThis as any).__TNL_DEVTOOLS__.disposeShortcuts = () => {
  removeKeyDownListener()
  removeKeyUpListener()
  removeShortcutCancelListener()
  removeWindowErrorListener()
  removeUnhandledRejectionListener()
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
