import { describe, expect, it } from "bun:test"
import { createWorkerRegistry } from "./workers"

describe("workers registry", () => {
  it("registers, updates, lists, and unregisters worker runtime entries", () => {
    const registry = createWorkerRegistry()
    registry.register({
      id: "render.1",
      name: "tnl-render-worker",
      kind: "render",
      createdAt: 10,
      status: "running",
      metrics: { inFlight: 2 },
    })
    registry.update("render.1", { status: "error", metrics: { lastError: "boom" } })

    const list = registry.list()
    expect(list).toHaveLength(1)
    expect(list[0].status).toBe("error")
    expect(list[0].metrics?.inFlight).toBe(2)
    expect(list[0].metrics?.lastError).toBe("boom")

    registry.unregister("render.1")
    expect(registry.list()).toHaveLength(0)
  })
})

