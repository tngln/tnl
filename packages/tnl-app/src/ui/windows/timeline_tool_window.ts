import { TimelineCompositeSurface } from "../surfaces/timeline_surface"
import { createFrameUnitAdapter } from "../timeline/model"
import { getPlaybackSession } from "@tnl/app/playback"
import type { Surface } from "@tnl/canvas-interface/ui"
import { SurfaceWindow } from "@tnl/canvas-interface/ui"

export const TIMELINE_TOOL_WINDOW_ID = "Timeline.Tool"

export function createTimelineToolSurface(): Surface {
  const session = getPlaybackSession()
  session.ensureInitialized()
  return new TimelineCompositeSurface({
    id: "Timeline.Real",
    view: session.timelineView(),
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
