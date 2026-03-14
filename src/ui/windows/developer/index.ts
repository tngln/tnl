import type { CodecRuntimeEntry } from "@/core/codecs"
import type { WorkerRuntimeEntry } from "@/core/workers"
import type { Rect } from "@/core/rect"
import type { DebugBlitInfo, DebugLayerInfo } from "@/ui/base/compositor"
import type { DebugTreeNodeSnapshot } from "@/ui/base/ui"
import type { Surface } from "@/ui/base/viewport"
import type { DockingControlApi } from "@/ui/docking/manager"
import type { WindowControlApi } from "@/ui/base/window_manager"
import { createCodecPanel } from "./panels/codec_panel"
import { createControlPanel } from "./panels/control_panel"
import { createDataPanel } from "./panels/data_panel"
import { createInspectorPanel } from "./panels/inspector_panel"
import { createStoragePanel } from "./panels/storage_panel"
import { createSurfacePanel } from "./panels/surface_panel"
import { createWmPanel } from "./panels/wm_panel"
import { createWorkerPanel } from "./panels/worker_panel"

export type DeveloperContext = {
  reactivity?: { list?: () => unknown }
  storage?: { opfs?: FileSystemDirectoryHandle }
  wm?: WindowControlApi
  workers?: { info?: () => unknown; list?: () => WorkerRuntimeEntry[] }
  codecs?: { info?: () => unknown; list?: () => CodecRuntimeEntry[] }
  surface?: {
    listLayers?: () => DebugLayerInfo[]
    listBlits?: () => DebugBlitInfo[]
    setOverlay?: (rect: Rect | null) => void
    setPaintFlash?: (on: boolean) => void
    getPaintFlash?: () => boolean
  }
  inspector?: { tree?: () => DebugTreeNodeSnapshot; eval?: (code: string) => unknown }
  docking?: DockingControlApi
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
    createWorkerPanel(),
    createCodecPanel(),
    createSurfacePanel(),
    createInspectorPanel(),
  ]
}
