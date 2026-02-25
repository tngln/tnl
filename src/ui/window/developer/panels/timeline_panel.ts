import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createTimelinePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Timeline",
    title: "Timeline",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Timeline.Surface",
        title: "Timeline",
        body: "TODO: define event schema and instrumentation points. TODO: ring buffer + sampling. TODO: timeline UI with zoom/pan and track lanes. TODO: mark long tasks, frames, surface renders, worker jobs. TODO: export snapshot.",
      }),
  }
}

