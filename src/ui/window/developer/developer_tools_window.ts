import { ViewportElement } from "../../base/viewport"
import { TabPanelSurface } from "../../surfaces/tab_panel_surface"
import { ModalWindow } from "../window"
import { defaultDeveloperPanels, type DeveloperContext } from "./index"

export const DEVELOPER_WINDOW_ID = "Developer"

export class DeveloperToolsWindow extends ModalWindow {
  private body = { x: 0, y: 0, w: 0, h: 0 }
  private readonly viewport: ViewportElement

  constructor(ctx: DeveloperContext = {}) {
    super({
      id: DEVELOPER_WINDOW_ID,
      x: 140,
      y: 120,
      w: 720,
      h: 480,
      minW: 520,
      minH: 320,
      title: "Developer",
      open: false,
      resizable: true,
    })

    const panels = defaultDeveloperPanels()
    const tabs = new TabPanelSurface({
      id: "Developer.Tools.Tabs",
      tabs: panels.map((p) => ({ id: p.id, title: p.title, surface: p.build(ctx) })),
      selectedId: "Developer.Control",
    })

    this.viewport = new ViewportElement({
      rect: () => this.body,
      target: tabs,
      options: { clip: true, padding: 0, active: () => this.open.peek() && !this.minimized.peek() },
    })
    this.viewport.z = 1
    this.add(this.viewport)
  }

  protected drawBody(_ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    this.body = { x, y, w, h }
  }
}

