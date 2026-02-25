import type { Surface } from "../../base/viewport"
import { createCodecPanel } from "./panels/codec_panel"
import { createControlPanel } from "./panels/control_panel"
import { createDataPanel } from "./panels/data_panel"
import { createInspectorPanel } from "./panels/inspector_panel"
import { createStoragePanel } from "./panels/storage_panel"
import { createSurfacePanel } from "./panels/surface_panel"
import { createTimelinePanel } from "./panels/timeline_panel"
import { createWmPanel } from "./panels/wm_panel"
import { createWorkerPanel } from "./panels/worker_panel"

export type DeveloperContext = {
  reactivity?: { list?: () => unknown }
  storage?: { opfs?: FileSystemDirectoryHandle }
  wm?: { listWindows?: () => { id: string; open: boolean; minimized: boolean }[]; toggle?: (id: string) => void }
  timeline?: { emit?: (event: unknown) => void; events?: () => unknown[] }
  workers?: { list?: () => unknown[] }
  codecs?: { info?: () => unknown }
  surface?: { listLayers?: () => unknown[] }
  inspector?: { eval?: (code: string) => unknown }
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
    createTimelinePanel(),
    createWorkerPanel(),
    createCodecPanel(),
    createSurfacePanel(),
    createInspectorPanel(),
  ]
}

