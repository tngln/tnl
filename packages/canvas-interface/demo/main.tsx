import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { Button, Label, PanelActionRow, PanelBody, PanelColumn, PanelHeader, PanelSection, RichText, SectionStack, VStack } from "@tnl/canvas-interface/builder/components"
import { defineSurface, surfaceMount } from "@tnl/canvas-interface/builder/surface_builder"
import { getRootCanvas, applyDocumentTheme, scheduleAnimationFrame, addWindowResizeListener } from "@tnl/canvas-interface/platform/web"
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
          <Label tone="muted" size="meta">No tnl-app runtime required</Label>
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

        <PanelBody>
          <VStack style={{ gap: theme.spacing.sm, grow: 1, basis: 0 }}>
            <PanelSection title="What This Proves">
              <RichText selectable>
                <b>`canvas-interface`</b> can host its own <i>window manager</i>, <i>builder surface</i>, and <i>Developer</i> window without importing any `tnl-app` code.
              </RichText>
            </PanelSection>

            <PanelSection title="Live State">
              <SectionStack>
                <Label overflow="visible">{`Clicks: ${clicks.get()}`}</Label>
                <Label tone="muted" overflow="visible">{`Paint flash: ${props.isPaintFlashEnabled() ? "enabled" : "disabled"}`}</Label>
                <Label tone="muted" overflow="visible">{`Signals currently tracked: ${listSignals().length}`}</Label>
              </SectionStack>
            </PanelSection>

            <PanelSection title="Suggested Checks">
              <SectionStack>
                <Label tone="muted">Drag and resize windows.</Label>
                <Label tone="muted">Open Developer and inspect WM / Surface / Runtime / Data panels.</Label>
                <Label tone="muted">Toggle paint flash and interact with this window.</Label>
              </SectionStack>
            </PanelSection>
          </VStack>
          <PanelSection title="Notes">
            <Label tone="muted" overflow="visible">
              Storage panel behavior still depends on browser OPFS availability, but the demo itself is framework-only.
            </Label>
          </PanelSection>
        </PanelBody>
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
