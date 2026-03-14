import { PlaybackSurface } from "../surfaces/playback_surface"
import { mountSurface } from "../builder/surface_builder"
import { SurfaceWindow } from "../base/window"

export const PLAYBACK_TOOL_WINDOW_ID = "Playback.Tool"

export function createPlaybackToolSurface() {
  return mountSurface(PlaybackSurface, {})
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