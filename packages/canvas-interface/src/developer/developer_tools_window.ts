import type { Surface } from "../viewport"
import { SurfaceWindow } from "../window"
import { TabPanelSurface } from "../surfaces/tab_panel_surface"
import { defaultDeveloperPanels, type DeveloperContext, type DeveloperPanelSpec } from "./index"

export const DEVELOPER_WINDOW_ID = "Developer"

export function createDeveloperToolsSurface(ctx: DeveloperContext = {}, panels: DeveloperPanelSpec[] = defaultDeveloperPanels()): Surface {
  return new TabPanelSurface({
    id: "Developer.Tools.Tabs",
    tabs: panels.map((p) => ({ id: p.id, title: p.title, surface: p.build(ctx) })),
    selectedId: panels.some((panel) => panel.id === "Developer.Control") ? "Developer.Control" : panels[0]?.id,
    scrollbar: true,
  })
}

export function createDeveloperToolsWindow(ctx: DeveloperContext = {}, panels: DeveloperPanelSpec[] = defaultDeveloperPanels()) {
  const tabs = createDeveloperToolsSurface(ctx, panels)
  return new SurfaceWindow({
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
