import { mountSurface } from "../../builder"
import { ControlsSurface } from "../controls_surface"
import type { DeveloperPanelSpec } from "../index"

export function createControlPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Control",
    title: "Control",
    build: (_ctx) => mountSurface(ControlsSurface, { debugLabelPrefix: "developer.controls" }),
  }
}
