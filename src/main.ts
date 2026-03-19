import { scheduleEffect } from "@tnl/canvas-interface/reactivity"
import { unionRect, type Rect } from "@tnl/canvas-interface/draw"
import { theme, neutral } from "@tnl/canvas-interface/theme"
import { CanvasUI, ModalWindow, Root, WindowManager } from "@tnl/canvas-interface/ui"
import { createLogger } from "@tnl/canvas-interface/debug"
import { invariant, toErrorInfo } from "@tnl/canvas-interface/errors"
import { createEventStream } from "@tnl/canvas-interface/event_stream"
import { ShortcutManager, type ShortcutContextResolver, type ShortcutExecutionContext } from "@tnl/canvas-interface/shortcuts"
import { createCodecRegistry, workerRegistry } from "@tnl/app/render"
import { ABOUT_DIALOG_ID, createAboutDialog } from "./ui/windows/about_dialog"
import { addBrowserInteractionCancelListener, addWindowErrorListener, addWindowKeyDownListener, addWindowKeyUpListener, addWindowLoadListener, addWindowResizeListener, addWindowUnhandledRejectionListener, applyDocumentTheme, getRootCanvas, registerServiceWorker, scheduleAnimationFrame } from "@tnl/canvas-interface/browser"
import { DockingManager, findLeafByPane } from "@tnl/canvas-interface/docking"
import { createDefaultDockablePaneSpecs, type DefaultDockablePaneSpec } from "./ui/docking/default_panes"

const canvas = getRootCanvas("#app")
invariant(canvas, {
  domain: "app",
  code: "CanvasNotFound",
  message: "Canvas not found",
  details: { selector: "#app" },
})

const appLog = createLogger("app")
appLog.info("Initializing application")

applyDocumentTheme(neutral[925], neutral[925])

const root = new Root()
const windows = new WindowManager(root)
const codecs = createCodecRegistry()
const docking = new DockingManager({ windows })

const keyDownEvents = createEventStream<KeyboardEvent>()
const keyUpEvents = createEventStream<KeyboardEvent>()
const pointerDownEvents = createEventStream<PointerEvent>()
const pointerUpEvents = createEventStream<PointerEvent>()
const wheelEvents = createEventStream<WheelEvent>()

const about = createAboutDialog()
windows.register(about)

const ui = new CanvasUI(canvas, root, {
  onTopLevelPointerDown(top) {
    if (top instanceof ModalWindow) windows.onWindowPointerDown(top)
    else top.bringToFront()
  },
  onNativePointerDown(event) {
    pointerDownEvents.emit(event)
  },
  onNativePointerUp(event) {
    pointerUpEvents.emit(event)
  },
  onNativeWheel(event) {
    wheelEvents.emit(event)
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

type AppShortcutSpec = {
  id: string
  key: string
  run(ctx: AppShortcutContext): void
}

function targetContextId(target: unknown) {
  if (!target || typeof target !== "object") return null
  const value = (target as { id?: unknown }).id
  return typeof value === "string" && value.length ? value : null
}

function registerGlobalShortcuts(shortcuts: ShortcutManager<AppShortcutContext>, specs: AppShortcutSpec[]) {
  for (const spec of specs) {
    shortcuts.registerCommand({
      id: spec.id,
      run: spec.run,
    })
    shortcuts.registerBinding({ command: spec.id, context: "global", trigger: { kind: "key-down", code: spec.key } })
  }
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

function resolveStartupTargetLeafId(workspaceId: string, paneId: string) {
  const leaf = findLeafByPane(docking.getRoot(workspaceId), paneId)
  invariant(leaf, {
    domain: "app",
    code: "DefaultPaneTargetNotFound",
    message: `Default workspace pane target not found: ${paneId}`,
    details: { workspaceId, paneId },
  })
  return leaf.id
}

function initializeDefaultWorkspace(panes: DefaultDockablePaneSpec[]) {
  const workspaceId = docking.createContainer()
  for (const pane of panes) {
    if (pane.startup.kind === "float") {
      docking.floatPane(pane.id, pane.floatingRect)
      continue
    }
    const targetLeafId = pane.startup.targetPaneId ? resolveStartupTargetLeafId(workspaceId, pane.startup.targetPaneId) : null
    docking.dockPane(pane.id, workspaceId, targetLeafId, pane.startup.placement)
  }
}

const paneSpecs = createDefaultDockablePaneSpecs(developerContext)
for (const pane of paneSpecs) docking.registerPane(pane)

const paneShortcutSpecs: AppShortcutSpec[] = paneSpecs.flatMap((pane) =>
  pane.activation
    ? [{
        id: pane.activation.command,
        key: pane.activation.key,
        run(ctx) {
          ctx.docking.activatePane(pane.id)
          ctx.ui.invalidate()
        },
      }]
    : [],
)

registerGlobalShortcuts(shortcuts, [
  {
    id: "app.toggleAbout",
    key: "F1",
    run(ctx) {
      ctx.wm.toggle(ABOUT_DIALOG_ID)
      const snap = ctx.wm.listWindows().find((entry) => entry.id === ABOUT_DIALOG_ID)
      if (snap?.open && !snap.minimized) ctx.wm.focus(ABOUT_DIALOG_ID)
      ctx.ui.invalidate()
    },
  },
  ...paneShortcutSpecs,
])

initializeDefaultWorkspace(paneSpecs)

windows.setCanvasSize(ui.sizeCss)
;(globalThis as any).__TNL_DEVTOOLS__ ??= {}
;(globalThis as any).__TNL_DEVTOOLS__.invalidate = () => ui.invalidate()
;(globalThis as any).__TNL_DEVTOOLS__.codecs = codecs
;(globalThis as any).__TNL_DEVTOOLS__.docking = docking
const lastRects = new Map<string, { x: number; y: number; w: number; h: number }>()

scheduleEffect(() => {
  const pad = 24

  for (const snap of windows.listWindows()) {
    const cur = snap.rect
    const prev = lastRects.get(snap.id)
    if (prev && prev.x === cur.x && prev.y === cur.y && prev.w === cur.w && prev.h === cur.h) continue
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

const keyDownSubscription = keyDownEvents.stream.subscribe((event) => {
  const result = ui.handleKeyDown({
    code: event.code,
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    timeStamp: event.timeStamp,
  })
  if (result.consumed) {
    shortcuts.syncKeyDown(event)
    if (result.preventDefault) event.preventDefault()
    return
  }
  shortcuts.handleKeyDown(event)
})

const keyUpSubscription = keyUpEvents.stream.subscribe((event) => {
  const result = ui.handleKeyUp({
    code: event.code,
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    timeStamp: event.timeStamp,
  })
  if (result.preventDefault) event.preventDefault()
  shortcuts.handleKeyUp(event)
})

const pointerDownSubscription = pointerDownEvents.stream.subscribe((event) => {
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

const pointerUpSubscription = pointerUpEvents.stream.subscribe((event) => {
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

const wheelSubscription = wheelEvents.stream.subscribe((event) => {
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
})

const removeKeyDownListener = addWindowKeyDownListener((event) => keyDownEvents.emit(event))
const removeKeyUpListener = addWindowKeyUpListener((event) => keyUpEvents.emit(event))

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
  keyDownSubscription.unsubscribe()
  keyUpSubscription.unsubscribe()
  pointerDownSubscription.unsubscribe()
  pointerUpSubscription.unsubscribe()
  wheelSubscription.unsubscribe()
  removeKeyDownListener()
  removeKeyUpListener()
  removeShortcutCancelListener()
  removeWindowErrorListener()
  removeUnhandledRejectionListener()
}

addWindowLoadListener(() => {
  void registerServiceWorker("./sw.js", "./").catch(() => {})
})
