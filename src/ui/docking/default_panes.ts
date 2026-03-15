import type { DeveloperContext } from "../windows/developer"
import { createDeveloperToolsSurface, DEVELOPER_WINDOW_ID } from "../windows/developer/developer_tools_window"
import { createExplorerSurface, EXPLORER_WINDOW_ID } from "../windows/explorer_window"
import { createPlaybackToolSurface, PLAYBACK_TOOL_WINDOW_ID } from "../windows/playback_tool_window"
import { createTimecodeToolSurface, TIMECODE_TOOL_WINDOW_ID } from "../windows/timecode_tool_window"
import { createTimelineToolSurface, TIMELINE_TOOL_WINDOW_ID } from "../windows/timeline_tool_window"
import { createToolsSurface, TOOLS_DIALOG_ID } from "../windows/tools_dialog"
import type { DockablePaneInit } from "./manager"
import { theme, neutral } from "../../config/theme"
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
    g.fillStyle = neutral[850]
    g.strokeStyle = neutral[300]
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

    g.fillStyle = theme.colors.text
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
      id: EXPLORER_WINDOW_ID,
      surface: createExplorerSurface(),
      floatingRect: { x: 160, y: 140, w: 860, h: 560 },
      dragImage: () => makePaneDragImage("Explorer"),
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
