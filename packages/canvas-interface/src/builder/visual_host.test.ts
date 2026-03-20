import { describe, expect, it } from "bun:test"
import { createVisualHostState, drawVisualHost, syncVisualHostState } from "@tnl/canvas-interface/builder"
import { fakeCtx } from "./test_utils"

describe("visual host", () => {
  it("syncs host state and draws through the shared renderer", () => {
    const host = createVisualHostState<{ label: string }>()
    const ctx = fakeCtx() as CanvasRenderingContext2D & { calls: Array<{ op: string; args: any[] }> }

    syncVisualHostState(host, {
      rect: { x: 0, y: 0, w: 80, h: 20 },
      model: { label: "Host" },
      context: { state: { hover: false, pressed: false, dragging: false, disabled: false } },
    })

    drawVisualHost(ctx, host, (model) => ({
      kind: "text",
      text: model.label,
      style: { base: { text: { baseline: "middle" } } },
    }))

    expect(ctx.calls.some((call) => call.op === "fillText" && call.args[0] === "Host")).toBe(true)
  })
})
