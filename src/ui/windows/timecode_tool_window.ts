import type { Surface } from "../base/viewport"
import { createTimecodeToolSurface } from "../surfaces/timecode_surface"
import { SurfaceWindow } from "../base/window"

export const TIMECODE_TOOL_WINDOW_ID = "Timecode.Tool"
export { createTimecodeToolSurface }

export function createTimecodeToolWindow() {
  return new SurfaceWindow({
    id: TIMECODE_TOOL_WINDOW_ID,
    x: 980,
    y: 40,
    w: 320,
    h: 150,
    title: "Timecode",
    open: false,
    minW: 240,
    minH: 120,
    resizable: true,
    chrome: "tool",
    minimizable: false,
    body: createTimecodeToolSurface(),
  })
}