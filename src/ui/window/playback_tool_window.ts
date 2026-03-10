import type { Surface } from "../base/viewport"
import { PlaybackSurface } from "../surfaces/playback_surface"
import { SurfaceWindow } from "./window"

export const PLAYBACK_TOOL_WINDOW_ID = "Playback.Tool"

export function createPlaybackToolSurface(): Surface {
  return new PlaybackSurface({ id: "Playback.Surface" })
}

export function createPlaybackToolWindow() {
  return new SurfaceWindow({
    id: PLAYBACK_TOOL_WINDOW_ID,
    x: 420,
    y: 120,
    w: 920,
    h: 560,
    title: "Playback",
    open: false,
    minW: 680,
    minH: 420,
    resizable: true,
    chrome: "tool",
    minimizable: false,
    body: createPlaybackToolSurface(),
  })
}