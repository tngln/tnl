import {
  createControlPanel,
  createDataPanel,
  createDeveloperToolsSurface as createBaseDeveloperToolsSurface,
  createDeveloperToolsWindow as createBaseDeveloperToolsWindow,
  createInspectorPanel,
  createSurfacePanel,
  createWmPanel,
  DEVELOPER_WINDOW_ID,
  type DeveloperContext,
  type DeveloperPanelSpec,
} from "@tnl/canvas-interface/developer"
import { createCodecPanel } from "./panels/codec_panel"
import { createStoragePanel } from "./panels/storage_panel"
import { createWorkerPanel } from "./panels/worker_panel"

export type { DeveloperContext, DeveloperPanelSpec }
export { DEVELOPER_WINDOW_ID }

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

export function createDeveloperToolsSurface(ctx: DeveloperContext = {}) {
  return createBaseDeveloperToolsSurface(ctx, defaultDeveloperPanels())
}

export function createDeveloperToolsWindow(ctx: DeveloperContext = {}) {
  return createBaseDeveloperToolsWindow(ctx, defaultDeveloperPanels())
}
