import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createStoragePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Storage",
    title: "Storage",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Storage.Surface",
        title: "Storage",
        body: "TODO: OPFS usage summary (quota, usage, top-level directories). TODO: list files by size and last modified. TODO: provide cleanup actions (delete selected, clear all, vacuum). TODO: show progress and keep UI responsive.",
      }),
  }
}

