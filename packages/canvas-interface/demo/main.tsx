import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { Button, PanelActionRow, PanelColumn, PanelHeader, PanelSection, RichText, Spacer, Text, VStack } from "@tnl/canvas-interface/builder/components"
import { defineSurface, surfaceMount } from "@tnl/canvas-interface/builder/surface_builder"
import { getRootCanvas, applyDocumentTheme, scheduleAnimationFrame, addWindowResizeListener } from "@tnl/canvas-interface/browser"
import { createDeveloperToolsWindow, DEVELOPER_WINDOW_ID, type DeveloperContext } from "@tnl/canvas-interface/developer"
import { invariant } from "@tnl/canvas-interface/errors"
import { listSignals, signal } from "@tnl/canvas-interface/reactivity"
import { theme, neutral } from "@tnl/canvas-interface/theme"
import { CanvasUI, ModalWindow, Root, WindowManager } from "@tnl/canvas-interface/ui"
import { SurfaceWindow } from "@tnl/canvas-interface/window"

const canvas = getRootCanvas("#app")
invariant(canvas, {
  domain: "app",
  code: "CanvasNotFound",
  message: "Canvas not found",
  details: { selector: "#app" },
})

applyDocumentTheme(neutral[925], neutral[925])

type DemoSurfaceProps = {
  openDeveloper(): void
  togglePaintFlash(): void
  isPaintFlashEnabled(): boolean
}

const DemoHomeSurface = defineSurface<DemoSurfaceProps>({
  id: "CanvasInterface.Demo.Home",
  setup: () => {
    const clicks = signal(0, { debugLabel: "canvas_interface_demo.clicks" })

    return (props) => (
      <PanelColumn>
        <PanelHeader title="Canvas Interface Demo" meta="framework-only sample">
          <Text tone="muted" size="meta">No tnl-app runtime required</Text>
        </PanelHeader>

        <PanelActionRow
          compact
          actions={[
            { key: "developer", icon: "D", text: "Dev", title: "Open Developer", onClick: props.openDeveloper },
            {
              key: "paint-flash",
              icon: props.isPaintFlashEnabled() ? "P" : "p",
              text: props.isPaintFlashEnabled() ? "Flash On" : "Flash Off",
              title: "Toggle paint flash",
              onClick: props.togglePaintFlash,
              width: 88,
            },
            { key: "count", icon: "+", text: "Count", title: "Increment", onClick: () => clicks.set((value) => value + 1) },
          ]}
        />

        <VStack style={{ gap: theme.spacing.sm, fill: true }}>
          <PanelSection title="What This Proves">
            <RichText selectable>
              <b>`canvas-interface`</b> can host its own <i>window manager</i>, <i>builder surface</i>, and <i>Developer</i> window without importing any `tnl-app` code.
            </RichText>
          </PanelSection>

          <PanelSection title="Live State">
            <VStack style={{ gap: theme.spacing.xs }}>
              <Text>{`Clicks: ${clicks.get()}`}</Text>
              <Text tone="muted">{`Paint flash: ${props.isPaintFlashEnabled() ? "enabled" : "disabled"}`}</Text>
              <Text tone="muted">{`Signals currently tracked: ${listSignals().length}`}</Text>
            </VStack>
          </PanelSection>

          <PanelSection title="Suggested Checks">
            <VStack style={{ gap: theme.spacing.xs }}>
              <Text tone="muted">Drag and resize windows.</Text>
              <Text tone="muted">Open Developer and inspect WM / Surface / Runtime / Data panels.</Text>
              <Text tone="muted">Toggle paint flash and interact with this window.</Text>
            </VStack>
          </PanelSection>

          <Spacer style={{ fill: true }} />

          <PanelSection title="Notes">
            <Text tone="muted">
              Storage panel behavior still depends on browser OPFS availability, but the demo itself is framework-only.
            </Text>
          </PanelSection>
        </VStack>
      </PanelColumn>
    )
  },
})

const root = new Root()
const windows = new WindowManager(root)

const ui = new CanvasUI(canvas, root, {
  onTopLevelPointerDown(top) {
    if (top instanceof ModalWindow) windows.onWindowPointerDown(top)
    else top.bringToFront()
  },
})

const developerContext: DeveloperContext = {
  reactivity: {
    list: () => listSignals(),
  },
  wm: windows,
  surface: {
    listLayers: () => ui.debugCompositorLayers(),
    listBlits: () => ui.debugCompositorFrameBlits(),
    setOverlay: (rect) => ui.setDebugOverlay(rect),
    setPaintFlash: (on) => ui.setDebugPaintFlash(on),
    getPaintFlash: () => ui.isDebugPaintFlashEnabled(),
    getRuntime: () => ui.debugInteractionState(),
  },
  inspector: {
    tree: () => root.debugSnapshot(),
    beginPick: (opts) => ui.beginDebugInspectorPick(opts),
  },
}

const developer = createDeveloperToolsWindow(developerContext)
developer.openWindow()

const home = new SurfaceWindow({
  id: "CanvasInterface.Demo.HomeWindow",
  x: 56,
  y: 56,
  w: 520,
  h: 420,
  minW: 380,
  minH: 280,
  title: "Canvas Interface",
  open: true,
  resizable: true,
  body: surfaceMount(DemoHomeSurface, {
    openDeveloper() {
      windows.open(DEVELOPER_WINDOW_ID)
      windows.focus(DEVELOPER_WINDOW_ID)
      ui.invalidate()
    },
    togglePaintFlash() {
      ui.setDebugPaintFlash(!ui.isDebugPaintFlashEnabled())
      ui.invalidate()
    },
    isPaintFlashEnabled() {
      return ui.isDebugPaintFlashEnabled()
    },
  }),
})

windows.register(home)
windows.register(developer)
windows.focus(home.id)
windows.setCanvasSize(ui.sizeCss)

;(globalThis as any).__TNL_DEVTOOLS__ ??= {}
;(globalThis as any).__TNL_DEVTOOLS__.invalidate = () => ui.invalidate()

addWindowResizeListener(() => {
  scheduleAnimationFrame(() => {
    windows.setCanvasSize(ui.sizeCss)
  })
})
