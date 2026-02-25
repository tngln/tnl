import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createInspectorPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Inspector",
    title: "Inspector",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Inspector.Surface",
        title: "Inspector",
        body: "TODO: element picking (hover highlight + click select). TODO: show element bounds, props, and runtime state. TODO: REPL console with safe evaluation and restricted globals. TODO: history, autocomplete, and error reporting.",
      }),
  }
}

