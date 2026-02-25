import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createDataPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Data",
    title: "Data",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Data.Surface",
        title: "Data",
        body: "TODO: introduce a signal registry with stable ids, names, and scope grouping. TODO: tree view with expand/collapse. TODO: support selecting a node and viewing current value. TODO: add search and filter by scope/module.",
      }),
  }
}

