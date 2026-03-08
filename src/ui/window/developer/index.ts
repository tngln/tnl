import type { Surface } from "../../base/viewport"
import type { WindowControlApi } from "../window_manager"
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
    createWorkerPanel(),
    createCodecPanel(),
    createSurfacePanel(),
    createInspectorPanel(),
  ]
}
