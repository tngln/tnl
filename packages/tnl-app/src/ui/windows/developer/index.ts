import {
  defaultDeveloperPanels as defaultBaseDeveloperPanels,
  createDeveloperToolsSurface as createBaseDeveloperToolsSurface,
  createDeveloperToolsWindow as createBaseDeveloperToolsWindow,
  DEVELOPER_WINDOW_ID,
  type DeveloperContext,
  type DeveloperPanelSpec,
} from "@tnl/canvas-interface/developer"
import { createCodecPanel } from "./panels/codec_panel"
import { createWorkerPanel } from "./panels/worker_panel"

export type { DeveloperContext, DeveloperPanelSpec }
export { DEVELOPER_WINDOW_ID }

export function tnlAppDeveloperPanels(): DeveloperPanelSpec[] {
  return [
    createWorkerPanel(),
    createCodecPanel(),
  ]
}

export function createDeveloperToolsSurface(ctx: DeveloperContext = {}) {
  return createBaseDeveloperToolsSurface(ctx, [...defaultBaseDeveloperPanels(), ...tnlAppDeveloperPanels()])
}

export function createDeveloperToolsWindow(ctx: DeveloperContext = {}) {
  return createBaseDeveloperToolsWindow(ctx, [...defaultBaseDeveloperPanels(), ...tnlAppDeveloperPanels()])
}
