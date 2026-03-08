import { createInfoPanel } from "./info_panel"
import type { DeveloperPanelSpec } from "../index"

export function createWorkerPanel(): DeveloperPanelSpec {
  return createInfoPanel({
    id: "Developer.Worker",
    title: "Worker",
    heading: "Workers",
    summary: "Worker diagnostics are still not backed by a registry, but the panel structure is now aligned with the current declarative Builder approach.",
    notes: [
      "Add a worker registry.",
      "Show active workers and current job descriptions.",
      "Support progress reporting, cancellation, and safe error or log surfacing.",
    ],
  })
}
