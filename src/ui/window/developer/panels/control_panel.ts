import { ControlsSurface } from "@/ui/surfaces/controls_surface"
import { mountSurface } from "@/ui/builder/surface_builder"
import type { DeveloperPanelSpec } from "../index"

export function createControlPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Control",
    title: "Control",
    build: (_ctx) => mountSurface(ControlsSurface, { debugLabelPrefix: "developer.controls" }),
  }
}
