import { describe, expect, it } from "bun:test"
import { DragDropController, type ActiveDragSession, type DragPayloadByKind, type DropCandidate, type DropProvider } from "./drag_drop"

declare module "./drag_drop" {
  interface DragPayloadByKind {
    "test.box": { id: string }
  }
}

function provider(opts: {
  id: string
  orderKey: number
  resolve: (session: ActiveDragSession, p: { x: number; y: number }) => DropCandidate | null
}): DropProvider {
  return {
    id: opts.id,
    orderKey: () => opts.orderKey,
    resolve: opts.resolve,
  }
}

describe("drag drop", () => {
  it("selects the highest-order provider candidate", () => {
    const dd = new DragDropController()
    dd.registerProvider(
      provider({
        id: "low",
        orderKey: 1,
        resolve: () => ({
          targetId: "low",
          effect: "move",
          commit() {},
        }),
      }),
    )
    dd.registerProvider(
      provider({
        id: "high",
        orderKey: 100,
        resolve: () => ({
          targetId: "high",
          effect: "move",
          commit() {},
        }),
      }),
    )

    dd.begin({ kind: "test.box", payload: { id: "a" }, pointerId: 1, start: { x: 0, y: 0 } })
    expect(dd.getActive()?.candidate?.targetId).toBe("high")
  })

  it("calls onTargetChanged only when targetId changes", () => {
    const dd = new DragDropController()
    let changed = 0
    dd.registerProvider(
      provider({
        id: "p",
        orderKey: 0,
        resolve: (_session, p) =>
          p.x < 10
            ? {
                targetId: "a",
                effect: "move",
                commit() {},
              }
            : {
                targetId: "b",
                effect: "move",
                commit() {},
              },
      }),
    )
    dd.begin({
      kind: "test.box",
      payload: { id: "a" },
      pointerId: 1,
      start: { x: 0, y: 0 },
      behavior: {
        onTargetChanged: () => {
          changed++
        },
      },
    })
    // begin() primes candidate
    expect(changed).toBe(1)
    dd.move(1, { x: 1, y: 0 }, 1)
    expect(changed).toBe(1)
    dd.move(1, { x: 12, y: 0 }, 1)
    expect(changed).toBe(2)
    dd.move(1, { x: 20, y: 0 }, 1)
    expect(changed).toBe(2)
  })

  it("cancels on buttons released and calls onCancel", () => {
    const dd = new DragDropController()
    let canceled: string | null = null
    dd.begin({
      kind: "test.box",
      payload: { id: "a" },
      pointerId: 1,
      start: { x: 0, y: 0 },
      behavior: {
        onCancel: (reason) => {
          canceled = reason
        },
      },
    })
    dd.move(1, { x: 2, y: 0 }, 0)
    expect(canceled).toBe("buttons-released")
    expect(dd.getActive()).toBe(null)
  })

  it("commits exactly once on end", () => {
    const dd = new DragDropController()
    let commits = 0
    dd.registerProvider(
      provider({
        id: "p",
        orderKey: 0,
        resolve: () => ({
          targetId: "t",
          effect: "move",
          commit() {
            commits++
          },
        }),
      }),
    )

    dd.begin({ kind: "test.box", payload: { id: "a" }, pointerId: 1, start: { x: 0, y: 0 } })
    dd.end(1, { x: 1, y: 1 })
    dd.end(1, { x: 2, y: 2 })
    expect(commits).toBe(1)
  })

  it("stores dragImage from begin and allows updating via setDragImage", () => {
    const dd = new DragDropController()
    const source = {} as any
    dd.begin({
      kind: "test.box",
      payload: { id: "a" },
      pointerId: 1,
      start: { x: 0, y: 0 },
      dragImage: { source, sizeCss: { x: 20, y: 10 } },
    })
    expect(dd.getActive()?.dragImage?.source).toBe(source)
    dd.setDragImage(null)
    expect(dd.getActive()?.dragImage).toBe(null)
  })
})
