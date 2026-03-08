import { createInfoPanel } from "./info_panel"
import type { DeveloperPanelSpec } from "../index"

export function createSurfacePanel(): DeveloperPanelSpec {
  return createInfoPanel({
    id: "Developer.Surface",
    title: "Surface",
    heading: "Surface",
    summary: "Surface diagnostics are still placeholder content, but the panel itself now follows the same Builder surface pattern as the rest of Developer.",
    notes: [
      "Add compositor debug hooks to list layers and their sizes.",
      "Capture per-surface draw ops per frame.",
      "Visualize layer tree, blending, and last-frame commands for a selected layer.",
    ],
  })
}
