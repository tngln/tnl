import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createWorkerPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Worker",
    title: "Worker",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Worker.Surface",
        title: "Workers",
        body: "TODO: add a Worker registry. TODO: show active workers and current job description. TODO: progress reporting protocol and cancellation. TODO: surface errors and logs without leaking sensitive data.",
      }),
  }
}

