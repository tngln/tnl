import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createSurfacePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Surface",
    title: "Surface",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Surface.Surface",
        title: "Surface",
        body: "TODO: add compositor debug hooks to list layers and their sizes. TODO: capture per-surface draw ops per frame. TODO: visualize layer tree and blending. TODO: select a layer and inspect its last frame commands.",
      }),
  }
}

