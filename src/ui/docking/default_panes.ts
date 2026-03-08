import type { DeveloperContext } from "../window/developer"
import { createDeveloperToolsSurface, DEVELOPER_WINDOW_ID } from "../window/developer/developer_tools_window"
import { createTimelineToolSurface, TIMELINE_TOOL_WINDOW_ID } from "../window/timeline_tool_window"
import { createToolsSurface, TOOLS_DIALOG_ID } from "../window/tools_dialog"
import type { DockablePaneInit } from "./manager"

export function createDefaultDockablePanes(ctx: DeveloperContext): DockablePaneInit[] {
  return [
    {
      id: DEVELOPER_WINDOW_ID,
      surface: createDeveloperToolsSurface(ctx),
      floatingRect: { x: 120, y: 100, w: 720, h: 480 },
    },
    {
      id: TOOLS_DIALOG_ID,
      surface: createToolsSurface(),
      floatingRect: { x: 200, y: 180, w: 320, h: 220 },
    },
    {
      id: TIMELINE_TOOL_WINDOW_ID,
      surface: createTimelineToolSurface(),
      floatingRect: { x: 260, y: 220, w: 900, h: 320 },
    },
  ]
}
