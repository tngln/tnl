import { TabPanelSurface } from "../../surfaces/tab_panel_surface"
import { SurfaceWindow } from "../window"
import { defaultDeveloperPanels, type DeveloperContext } from "./index"

export const DEVELOPER_WINDOW_ID = "Developer"

export class DeveloperToolsWindow extends SurfaceWindow {
  constructor(ctx: DeveloperContext = {}) {
    const panels = defaultDeveloperPanels()
    const tabs = new TabPanelSurface({
      id: "Developer.Tools.Tabs",
      tabs: panels.map((p) => ({ id: p.id, title: p.title, surface: p.build(ctx) })),
      selectedId: "Developer.Control",
      scrollbar: true,
    })
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
      body: tabs,
    })
  }
}
