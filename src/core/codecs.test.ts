import { describe, expect, it } from "bun:test"
import { CodecRuntimeRegistry } from "./codecs"

describe("codecs registry", () => {
  it("registers, updates, lists, and unregisters codec runtime entries", () => {
    const registry = new CodecRuntimeRegistry()

    registry.register({
      id: "decoder.1",
      label: "Preview Decoder",
      kind: "video-decoder",
      codec: "avc1.42001E",
      status: "created",
    })
    registry.update("decoder.1", { status: "running", queueSize: 3 })

    const list = registry.list()
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe("running")
    expect(list[0].queueSize).toBe(3)

    registry.unregister("decoder.1")
    expect(registry.list()).toHaveLength(0)
  })
})
