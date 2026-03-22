import type { Rect } from "../draw"
import type { DebugBlitInfo, DebugCanvasRuntimeSnapshot, DebugLayerInfo, DebugTreeNodeSnapshot, Surface, WindowControlApi } from "../ui"
import { createControlPanel } from "./panels/control_panel"
import { createDataPanel } from "./panels/data_panel"
import { ControlsSurface } from "./controls_surface"
import { createDeveloperToolsSurface, createDeveloperToolsWindow, DEVELOPER_WINDOW_ID } from "./developer_tools_window"
import { createInspectorPanel } from "./panels/inspector_panel"
import { createRuntimePanel } from "./panels/runtime_panel"
import { createStoragePanel } from "./panels/storage_panel"
import { createSurfacePanel } from "./panels/surface_panel"
import { createWmPanel } from "./panels/wm_panel"

export type DeveloperWorkerEntry = {
  id: string
  name: string
  kind: string
  status: string
  createdAt: number
  lastMessageAt?: number
  metrics?: {
    inFlight?: number
    queued?: number
    completed?: number
    canceled?: number
    lastError?: string
  }
}

export type DeveloperCodecEntry = {
  id: string
  label: string
  kind: string
  codec: string
  status: string
  queueSize?: number
  hardwareAcceleration?: string
  detail?: string
}

export type DeveloperDockingApi = {
  createContainer?(): string
}

export type DeveloperInspectorPickHit = {
  path: string
  label: string
  type: string
  id?: string
  meta?: string
  bounds?: Rect
}

export type DeveloperContext = {
  reactivity?: { list?: () => unknown }
  wm?: WindowControlApi
  workers?: { info?: () => unknown; list?: () => DeveloperWorkerEntry[] }
  codecs?: { info?: () => unknown; list?: () => DeveloperCodecEntry[] }
  surface?: {
    listLayers?: () => DebugLayerInfo[]
    listBlits?: () => DebugBlitInfo[]
    setOverlay?: (rect: Rect | null) => void
    setPaintFlash?: (on: boolean) => void
    getPaintFlash?: () => boolean
    getRuntime?: () => DebugCanvasRuntimeSnapshot
  }
  inspector?: {
    tree?: () => DebugTreeNodeSnapshot
    eval?: (code: string) => unknown
    beginPick?: (opts: {
      onHover?: (hit: DeveloperInspectorPickHit | null) => void
      onPick?: (hit: DeveloperInspectorPickHit | null) => void
      onCancel?: () => void
    }) => () => void
  }
  docking?: DeveloperDockingApi
}

export type DeveloperPanelSpec = {
  id: string
  title: string
  build: (ctx: DeveloperContext) => Surface
}

export function defaultDeveloperPanels(): DeveloperPanelSpec[] {
  return [
    createDataPanel(),
    createStoragePanel(),
    createControlPanel(),
    createWmPanel(),
    createSurfacePanel(),
    createRuntimePanel(),
    createInspectorPanel(),
  ]
}

export {
  createControlPanel,
  ControlsSurface,
  createDataPanel,
  createDeveloperToolsSurface,
  createDeveloperToolsWindow,
  createInspectorPanel,
  createRuntimePanel,
  createStoragePanel,
  createSurfacePanel,
  createWmPanel,
  DEVELOPER_WINDOW_ID,
}
