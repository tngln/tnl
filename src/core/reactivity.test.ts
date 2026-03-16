import { describe, test, expect } from "bun:test"
import { signal, effect, batch, scheduleEffect, computed } from "./reactivity"

describe("signal", () => {
  test("get and set", () => {
    const s = signal(1)
    expect(s.get()).toBe(1)
    s.set(2)
    expect(s.get()).toBe(2)
  })

  test("peek does not subscribe", () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s.peek()
      runs++
    })
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(1)
  })

  test("set with updater function", () => {
    const s = signal(5)
    s.set((prev) => prev + 3)
    expect(s.get()).toBe(8)
  })

  test("skips notification for same value", () => {
    const s = signal(1)
    let runs = 0
    effect(() => {
      s.get()
      runs++
    })
    expect(runs).toBe(1)
    s.set(1)
    expect(runs).toBe(1)
  })
})

describe("effect", () => {
  test("runs immediately and re-runs on dependency changes", () => {
    const s = signal(0)
    const values: number[] = []
    effect(() => {
      values.push(s.get())
    })
    expect(values).toEqual([0])
    s.set(1)
    expect(values).toEqual([0, 1])
    s.set(2)
    expect(values).toEqual([0, 1, 2])
  })

  test("dispose stops tracking", () => {
    const s = signal(0)
    let runs = 0
    const dispose = effect(() => {
      s.get()
      runs++
    })
    expect(runs).toBe(1)
    dispose()
    s.set(1)
    expect(runs).toBe(1)
  })

  test("cleanup runs before re-execution", () => {
    const s = signal(0)
    const log: string[] = []
    effect(() => {
      const v = s.get()
      log.push(`run:${v}`)
      return () => log.push(`cleanup:${v}`)
    })
    expect(log).toEqual(["run:0"])
    s.set(1)
    expect(log).toEqual(["run:0", "cleanup:0", "run:1"])
  })
})

describe("computed", () => {
  test("derives value from signals", () => {
    const a = signal(2)
    const b = signal(3)
    const sum = computed(() => a.get() + b.get())
    expect(sum.get()).toBe(5)
    a.set(10)
    expect(sum.get()).toBe(13)
  })
})

describe("batch", () => {
  test("defers effect to end of batch", () => {
    const a = signal(0)
    const b = signal(0)
    const values: [number, number][] = []
    effect(() => {
      values.push([a.get(), b.get()])
    })
    expect(values).toEqual([[0, 0]])

    batch(() => {
      a.set(1)
      b.set(2)
    })
    // Effect should have run exactly once with both values updated
    expect(values).toEqual([[0, 0], [1, 2]])
  })

  test("effect runs once even with many signal changes", () => {
    const signals = Array.from({ length: 10 }, (_, i) => signal(i))
    let runs = 0
    effect(() => {
      for (const s of signals) s.get()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      for (const s of signals) s.set(99)
    })
    expect(runs).toBe(2)
  })

  test("nested batch defers until outermost completes", () => {
    const s = signal(0)
    let runs = 0
    effect(() => {
      s.get()
      runs++
    })
    expect(runs).toBe(1)

    batch(() => {
      s.set(1)
      batch(() => {
        s.set(2)
      })
      // Still inside outer batch — effect should not have re-run yet
      expect(runs).toBe(1)
    })
    // After outer batch completes, effect should have run once
    expect(runs).toBe(2)
    expect(s.peek()).toBe(2)
  })

  test("effects triggered by batch-flushed effects are processed", () => {
    const a = signal(0)
    const b = signal(0)
    // a drives b via effect
    effect(() => {
      b.set(a.get() * 10)
    })
    expect(b.peek()).toBe(0)

    const bValues: number[] = []
    effect(() => {
      bValues.push(b.get())
    })
    expect(bValues).toEqual([0])

    batch(() => {
      a.set(3)
    })
    // a→b effect updates b to 30, b effect should see 30
    expect(b.peek()).toBe(30)
    expect(bValues).toEqual([0, 30])
  })
})

describe("scheduleEffect", () => {
  test("runs initially synchronously to establish deps", () => {
    const s = signal(1)
    let value = 0
    scheduleEffect(() => {
      value = s.get()
    })
    expect(value).toBe(1)
  })

  test("defers re-run to microtask", async () => {
    const s = signal(0)
    const values: number[] = []
    scheduleEffect(() => {
      values.push(s.get())
    })
    expect(values).toEqual([0])

    s.set(1)
    // Should not have re-run synchronously
    expect(values).toEqual([0])

    // Wait for microtask
    await Promise.resolve()
    expect(values).toEqual([0, 1])
  })

  test("coalesces multiple signal changes into one re-run", async () => {
    const a = signal(0)
    const b = signal(0)
    let runs = 0
    scheduleEffect(() => {
      a.get()
      b.get()
      runs++
    })
    expect(runs).toBe(1)

    a.set(1)
    b.set(2)
    a.set(3)
    expect(runs).toBe(1)

    await Promise.resolve()
    expect(runs).toBe(2)
  })

  test("dispose cancels pending microtask", async () => {
    const s = signal(0)
    let runs = 0
    const dispose = scheduleEffect(() => {
      s.get()
      runs++
    })
    expect(runs).toBe(1)

    s.set(1)
    dispose()
    await Promise.resolve()
    expect(runs).toBe(1)
  })
})
