import type { Rect } from "../draw"
import type { DebugBlitInfo, DebugLayerInfo, DebugTreeNodeSnapshot, Surface, WindowControlApi } from "../ui"
import { createControlPanel } from "./panels/control_panel"
import { createDataPanel } from "./panels/data_panel"
import { ControlsSurface } from "./controls_surface"
import { createDeveloperToolsSurface, createDeveloperToolsWindow, DEVELOPER_WINDOW_ID } from "./developer_tools_window"
import { createInfoPanel } from "./panels/info_panel"
import { createInspectorPanel } from "./panels/inspector_panel"
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
  }
  inspector?: { tree?: () => DebugTreeNodeSnapshot; eval?: (code: string) => unknown }
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
    createInspectorPanel(),
  ]
}

export {
  createControlPanel,
  ControlsSurface,
  createDataPanel,
  createDeveloperToolsSurface,
  createDeveloperToolsWindow,
  createInfoPanel,
  createInspectorPanel,
  createStoragePanel,
  createSurfacePanel,
  createWmPanel,
  DEVELOPER_WINDOW_ID,
}
