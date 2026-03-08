import { ControlsSurface } from "../../../surfaces/controls_surface"
import { mountSurface } from "../../../builder/surface_builder"
import type { DeveloperPanelSpec } from "../index"

export function createControlPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Control",
    title: "Control",
    build: (_ctx) => mountSurface(ControlsSurface, {}),
  }
}
