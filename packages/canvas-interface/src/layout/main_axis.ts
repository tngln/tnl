import { clamp } from "../draw/rect"

export type MainAxisJustify = "start" | "center" | "end" | "space-between"

export type MainAxisDistribution = {
  sizes: number[]
  startOffset: number
  gap: number
  remainingMain: number
}

export type MainAxisDistributionOpts = {
  baseSizes: number[]
  availableMain: number
  gap?: number
  justify?: MainAxisJustify
  growWeights?: number[]
  shrinkWeights?: number[]
  minSizes?: number[]
  maxSizes?: number[]
}

function safePos(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return value
}

function distributeGrow(sizes: number[], weights: number[], maxes: number[], extra: number) {
  let remaining = extra
  let active: number[] = []
  for (let i = 0; i < sizes.length; i++) if (weights[i]! > 0 && sizes[i]! < maxes[i]!) active.push(i)
  for (let iter = 0; iter < 8 && remaining > 1e-6 && active.length > 0; iter++) {
    const total = active.reduce((sum, index) => sum + weights[index]!, 0)
    if (total <= 0) break
    const startRemaining = remaining
    let changed = 0
    for (const index of active) {
      const add = (startRemaining * weights[index]!) / total
      const next = Math.min(maxes[index]!, sizes[index]! + add)
      const delta = next - sizes[index]!
      if (delta > 0) {
        sizes[index] = next
        remaining -= delta
        changed += delta
      }
    }
    if (changed <= 1e-6) break
    active = active.filter((index) => sizes[index]! < maxes[index]! - 1e-9)
  }
}

function distributeShrink(sizes: number[], weights: number[], mins: number[], deficit: number) {
  let remaining = deficit
  let active: number[] = []
  for (let i = 0; i < sizes.length; i++) if (weights[i]! > 0 && sizes[i]! > mins[i]!) active.push(i)
  for (let iter = 0; iter < 8 && remaining > 1e-6 && active.length > 0; iter++) {
    const total = active.reduce((sum, index) => sum + weights[index]!, 0)
    if (total <= 0) break
    const startRemaining = remaining
    let changed = 0
    for (const index of active) {
      const sub = (startRemaining * weights[index]!) / total
      const next = Math.max(mins[index]!, sizes[index]! - sub)
      const delta = sizes[index]! - next
      if (delta > 0) {
        sizes[index] = next
        remaining -= delta
        changed += delta
      }
    }
    if (changed <= 1e-6) break
    active = active.filter((index) => sizes[index]! > mins[index]! + 1e-9)
  }
}

export function distributeMainAxis(opts: MainAxisDistributionOpts): MainAxisDistribution {
  const count = opts.baseSizes.length
  const baseGap = Math.max(0, safePos(opts.gap, 0))
  const justify = opts.justify ?? "start"
  const itemAvail = Math.max(0, safePos(opts.availableMain, 0) - baseGap * Math.max(0, count - 1))

  const sizes = opts.baseSizes.map((size, index) => {
    const min = Math.max(0, safePos(opts.minSizes?.[index], 0))
    const max = safePos(opts.maxSizes?.[index], Number.POSITIVE_INFINITY)
    return clamp(Math.max(0, safePos(size, 0)), min, max)
  })
  const mins = sizes.map((_size, index) => Math.max(0, safePos(opts.minSizes?.[index], 0)))
  const maxes = sizes.map((_size, index) => safePos(opts.maxSizes?.[index], Number.POSITIVE_INFINITY))
  const growWeights = sizes.map((_size, index) => Math.max(0, safePos(opts.growWeights?.[index], 0)))
  const shrinkWeights = sizes.map((_size, index) => Math.max(0, safePos(opts.shrinkWeights?.[index], 0)))

  const baseSum = sizes.reduce((sum, size) => sum + size, 0)
  const totalGrow = growWeights.reduce((sum, weight) => sum + weight, 0)
  const totalShrink = shrinkWeights.reduce((sum, weight) => sum + weight, 0)

  if (baseSum < itemAvail && totalGrow > 0) distributeGrow(sizes, growWeights, maxes, itemAvail - baseSum)
  if (baseSum > itemAvail && totalShrink > 0) distributeShrink(sizes, shrinkWeights, mins, baseSum - itemAvail)

  for (let i = 0; i < sizes.length; i++) sizes[i] = clamp(sizes[i]!, mins[i]!, maxes[i]!)

  const usedMain = sizes.reduce((sum, size) => sum + size, 0)
  const remainingMain = Math.max(0, itemAvail - usedMain)
  let startOffset = 0
  let gap = baseGap

  if (justify === "center") startOffset = remainingMain / 2
  else if (justify === "end") startOffset = remainingMain
  else if (justify === "space-between" && count > 1) gap += remainingMain / (count - 1)

  return { sizes, startOffset, gap, remainingMain }
}
