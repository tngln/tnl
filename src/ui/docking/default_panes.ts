import type { DeveloperContext } from "../window/developer"
import { createDeveloperToolsSurface, DEVELOPER_WINDOW_ID } from "../window/developer/developer_tools_window"
import { createPlaybackToolSurface, PLAYBACK_TOOL_WINDOW_ID } from "../window/playback_tool_window"
import { createTimecodeToolSurface, TIMECODE_TOOL_WINDOW_ID } from "../window/timecode_tool_window"
import { createTimelineToolSurface, TIMELINE_TOOL_WINDOW_ID } from "../window/timeline_tool_window"
import { createToolsSurface, TOOLS_DIALOG_ID } from "../window/tools_dialog"
import type { DockablePaneInit } from "./manager"
import { theme } from "../../config/theme"
import { createLayerCanvas, getCanvas2DContext } from "../../platform/web/canvas"
import type { DragImageSpec } from "../base/drag_drop"

export function createDefaultDockablePanes(ctx: DeveloperContext): DockablePaneInit[] {
  function makePaneDragImage(title: string): DragImageSpec {
    const wCss = 180
    const hCss = 28
    const scale = 2
    const canvas = createLayerCanvas(wCss * scale, hCss * scale)
    const g = getCanvas2DContext(canvas) as any as CanvasRenderingContext2D
    g.setTransform(scale, 0, 0, scale, 0, 0)
    g.clearRect(0, 0, wCss, hCss)

    const r = 8
    g.fillStyle = "rgba(20,26,36,0.92)"
    g.strokeStyle = "rgba(255,255,255,0.14)"
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(r, 0)
    g.lineTo(wCss - r, 0)
    g.quadraticCurveTo(wCss, 0, wCss, r)
    g.lineTo(wCss, hCss - r)
    g.quadraticCurveTo(wCss, hCss, wCss - r, hCss)
    g.lineTo(r, hCss)
    g.quadraticCurveTo(0, hCss, 0, hCss - r)
    g.lineTo(0, r)
    g.quadraticCurveTo(0, 0, r, 0)
    g.closePath()
    g.fill()
    g.stroke()

    g.fillStyle = theme.colors.textPrimary
    g.font = `${600} 12px ${theme.typography.family}`
    g.textAlign = "left"
    g.textBaseline = "middle"
    g.fillText(title, 10, hCss / 2 + 0.5)

    return {
      source: canvas as any,
      sizeCss: { x: wCss, y: hCss },
      // Center-align by default (controller normalizes too, but keep explicit here).
      offsetCss: { x: -wCss / 2, y: -hCss / 2 },
      opacity: 0.92,
    }
  }

  return [
    {
      id: DEVELOPER_WINDOW_ID,
      surface: createDeveloperToolsSurface(ctx),
      floatingRect: { x: 120, y: 100, w: 720, h: 480 },
      dragImage: () => makePaneDragImage("Developer"),
    },
    {
      id: TOOLS_DIALOG_ID,
      surface: createToolsSurface(),
      floatingRect: { x: 200, y: 180, w: 320, h: 220 },
      dragImage: () => makePaneDragImage("Tools"),
    },
    {
      id: TIMELINE_TOOL_WINDOW_ID,
      surface: createTimelineToolSurface(),
      floatingRect: { x: 260, y: 220, w: 900, h: 320 },
      dragImage: () => makePaneDragImage("Timeline"),
    },
    {
      id: PLAYBACK_TOOL_WINDOW_ID,
      surface: createPlaybackToolSurface(),
      floatingRect: { x: 320, y: 120, w: 920, h: 560 },
      dragImage: () => makePaneDragImage("Playback"),
    },
    {
      id: TIMECODE_TOOL_WINDOW_ID,
      surface: createTimecodeToolSurface(),
      floatingRect: { x: 980, y: 48, w: 320, h: 150 },
      dragImage: () => makePaneDragImage("Timecode"),
    },
  ]
}
