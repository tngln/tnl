import { createInfoPanel } from "./info_panel"
import type { DeveloperPanelSpec } from "../index"

export function createCodecPanel(): DeveloperPanelSpec {
  return createInfoPanel({
    id: "Developer.Codec",
    title: "Codec",
    heading: "WebCodecs",
    summary: "Codec diagnostics have not been wired to real runtime state yet. This panel is now on the Builder/JSX path, so the remaining work is data integration rather than more ad-hoc layout code.",
    notes: [
      "Show codec support matrix and hardware acceleration hints.",
      "Expose active decoder and encoder instances with current configuration.",
      "Surface dropped frames, queue sizes, and decode or encode latency.",
    ],
  })
}
