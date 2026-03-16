import { ControlsSurface } from "@/ui/surfaces/controls_surface"
import { mountSurface } from "@tnl/canvas-interface/builder"
import type { DeveloperPanelSpec } from "../index"

export function createControlPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Control",
    title: "Control",
    build: (_ctx) => mountSurface(ControlsSurface, { debugLabelPrefix: "developer.controls" }),
  }
}
