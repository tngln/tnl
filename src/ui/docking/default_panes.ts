import type { DeveloperContext } from "../windows/developer"
import { createDeveloperToolsSurface, DEVELOPER_WINDOW_ID } from "../windows/developer/developer_tools_window"
import { createExplorerSurface, EXPLORER_WINDOW_ID } from "../windows/explorer_window"
import { createPlaybackToolSurface, PLAYBACK_TOOL_WINDOW_ID } from "../windows/playback_tool_window"
import { createTimecodeToolSurface, TIMECODE_TOOL_WINDOW_ID } from "../windows/timecode_tool_window"
import { createTimelineToolSurface, TIMELINE_TOOL_WINDOW_ID } from "../windows/timeline_tool_window"
import { createToolsSurface, TOOLS_DIALOG_ID } from "../windows/tools_dialog"
import type { DockablePaneInit, DockDropPlacement } from "@tnl/canvas-interface/docking"
import { theme, neutral } from "../../config/theme"
import { createLayerCanvas, getCanvas2DContext } from "../../platform/web/canvas"
import type { DragImageSpec } from "@tnl/canvas-interface/drag_drop"

export type DefaultDockablePaneSpec = DockablePaneInit & {
  title: string
  activation?: {
    command: string
    key: string
  }
  startup:
    | { kind: "dock"; targetPaneId: string | null; placement: DockDropPlacement }
    | { kind: "float" }
}

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

export function createDefaultDockablePaneSpecs(ctx: DeveloperContext): DefaultDockablePaneSpec[] {
  return [
    {
      id: DEVELOPER_WINDOW_ID,
      title: "Developer",
      surface: createDeveloperToolsSurface(ctx),
      floatingRect: { x: 120, y: 100, w: 720, h: 480 },
      dragImage: () => makePaneDragImage("Developer"),
      activation: { command: "workspace.activateDeveloper", key: "F2" },
      startup: { kind: "dock", targetPaneId: null, placement: "center" },
    },
    {
      id: EXPLORER_WINDOW_ID,
      title: "Explorer",
      surface: createExplorerSurface(),
      floatingRect: { x: 160, y: 140, w: 860, h: 560 },
      dragImage: () => makePaneDragImage("Explorer"),
      activation: { command: "workspace.activateExplorer", key: "F7" },
      startup: { kind: "dock", targetPaneId: DEVELOPER_WINDOW_ID, placement: "center" },
    },
    {
      id: TOOLS_DIALOG_ID,
      title: "Tools",
      surface: createToolsSurface(),
      floatingRect: { x: 200, y: 180, w: 320, h: 220 },
      dragImage: () => makePaneDragImage("Tools"),
      activation: { command: "workspace.activateTools", key: "F3" },
      startup: { kind: "dock", targetPaneId: DEVELOPER_WINDOW_ID, placement: "center" },
    },
    {
      id: TIMELINE_TOOL_WINDOW_ID,
      title: "Timeline",
      surface: createTimelineToolSurface(),
      floatingRect: { x: 260, y: 220, w: 900, h: 320 },
      dragImage: () => makePaneDragImage("Timeline"),
      activation: { command: "workspace.activateTimeline", key: "F4" },
      startup: { kind: "dock", targetPaneId: DEVELOPER_WINDOW_ID, placement: "right" },
    },
    {
      id: PLAYBACK_TOOL_WINDOW_ID,
      title: "Playback",
      surface: createPlaybackToolSurface(),
      floatingRect: { x: 320, y: 120, w: 920, h: 560 },
      dragImage: () => makePaneDragImage("Playback"),
      activation: { command: "workspace.activatePlayback", key: "F5" },
      startup: { kind: "dock", targetPaneId: TIMELINE_TOOL_WINDOW_ID, placement: "bottom" },
    },
    {
      id: TIMECODE_TOOL_WINDOW_ID,
      title: "Timecode",
      surface: createTimecodeToolSurface(),
      floatingRect: { x: 980, y: 48, w: 320, h: 150 },
      dragImage: () => makePaneDragImage("Timecode"),
      activation: { command: "workspace.activateTimecode", key: "F6" },
      startup: { kind: "float" },
    },
  ]
}

export function createDefaultDockablePanes(ctx: DeveloperContext): DockablePaneInit[] {
  return createDefaultDockablePaneSpecs(ctx).map(({ title: _title, activation: _activation, startup: _startup, ...pane }) => pane)
}
