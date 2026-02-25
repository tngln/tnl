import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createWmPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.WM",
    title: "WM",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.WM.Surface",
        title: "Window Manager",
        body: "TODO: define WindowManager API (list windows, focus, toggle open, minimize/restore, move/resize). TODO: render a window list with current state. TODO: actions per row + bulk actions. TODO: keep ids stable and reflect real-time changes.",
      }),
  }
}

