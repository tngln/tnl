import { createInfoPanel } from "./info_panel"
import type { DeveloperPanelSpec } from "../index"

export function createInspectorPanel(): DeveloperPanelSpec {
  return createInfoPanel({
    id: "Developer.Inspector",
    title: "Inspector",
    heading: "Inspector",
    summary: "The inspector shell now matches the Builder panel model, but it still needs real picking and evaluation plumbing before it becomes useful.",
    notes: [
      "Implement element picking with hover highlight and click select.",
      "Show element bounds, props, and runtime state.",
      "Add a restricted REPL with history, autocomplete, and error reporting.",
    ],
  })
}
