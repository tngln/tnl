import { TimelineCompositeSurface } from "../surfaces/timeline_surface"
import { createFrameUnitAdapter } from "../timeline/model"
import { createTimelineDemoModel } from "../timeline/demo"
import type { Surface } from "../base/viewport"
import { SurfaceWindow } from "./window"

export const TIMELINE_TOOL_WINDOW_ID = "Timeline.Tool"

export function createTimelineToolSurface(): Surface {
  return new TimelineCompositeSurface({
    id: "Timeline.Demo",
    view: createTimelineDemoModel(),
    unitAdapter: createFrameUnitAdapter(1),
    initialPxPerUnit: 5,
    minPxPerUnit: 1,
    maxPxPerUnit: 28,
  })
}

export function createTimelineToolWindow() {
  const timeline = createTimelineToolSurface()
  return new SurfaceWindow({
    id: TIMELINE_TOOL_WINDOW_ID,
    x: 360,
    y: 360,
    w: 900,
    h: 320,
    title: "Timeline",
    open: false,
    minW: 520,
    minH: 220,
    resizable: true,
    chrome: "tool",
    minimizable: false,
    body: timeline,
  })
}
