import { createInfoPanel } from "./info_panel"
import type { DeveloperPanelSpec } from "../index"

export function createWmPanel(): DeveloperPanelSpec {
  return createInfoPanel({
    id: "Developer.WM",
    title: "WM",
    heading: "Window Manager",
    summary: "The window manager panel has been moved onto the current Builder authoring path. The missing piece is live window data and actions, not more manual surface layout.",
    notes: [
      "Define a WindowManager API for list, focus, toggle, minimize, restore, move, and resize.",
      "Render a live window list with current state.",
      "Add per-row and bulk actions while keeping window ids stable.",
    ],
  })
}
