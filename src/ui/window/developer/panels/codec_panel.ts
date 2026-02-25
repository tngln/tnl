import { TextSurface } from "../../../surfaces/text_surface"
import type { DeveloperPanelSpec } from "../index"

export function createCodecPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Codec",
    title: "Codec",
    build: (_ctx) =>
      new TextSurface({
        id: "Developer.Codec.Surface",
        title: "WebCodecs",
        body: "TODO: show codec support matrix and hardware acceleration hints. TODO: expose active decoder/encoder instances and their configuration. TODO: surface dropped frames, queue sizes, and decode/encode latency.",
      }),
  }
}

