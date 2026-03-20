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

const FLEX_EPSILON = 1e-6
const FLEX_BOUND_EPSILON = 1e-9

function safePos(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return value
}

function activeFlexItems(
  sizes: number[],
  weights: number[],
  mins: number[],
  maxes: number[],
  mode: "grow" | "shrink",
) {
  const active: number[] = []
  for (let i = 0; i < sizes.length; i++) {
    if (weights[i]! <= 0) continue
    if (mode === "grow") {
      if (sizes[i]! < maxes[i]! - FLEX_BOUND_EPSILON) active.push(i)
      continue
    }
    if (sizes[i]! > mins[i]! + FLEX_BOUND_EPSILON) active.push(i)
  }
  return active
}

function resolveFlexibleLengths(
  sizes: number[],
  weights: number[],
  mins: number[],
  maxes: number[],
  availableMain: number,
  mode: "grow" | "shrink",
) {
  let active = activeFlexItems(sizes, weights, mins, maxes, mode)
  while (active.length > 0) {
    const freeSpace = availableMain - sizes.reduce((sum, size) => sum + size, 0)
    if (mode === "grow" ? freeSpace <= FLEX_EPSILON : freeSpace >= -FLEX_EPSILON) break
    const total = active.reduce((sum, index) => sum + weights[index]!, 0)
    if (total <= FLEX_EPSILON) break

    const violations = new Set<number>()
    for (const index of active) {
      const delta = (freeSpace * weights[index]!) / total
      const tentative = sizes[index]! + delta
      const next = clamp(tentative, mins[index]!, maxes[index]!)
      sizes[index] = next
      if (Math.abs(next - tentative) > FLEX_EPSILON) violations.add(index)
    }

    if (violations.size === 0) break
    active = active.filter((index) => !violations.has(index))
  }
}

function distributeGrow(sizes: number[], weights: number[], mins: number[], maxes: number[], availableMain: number) {
  resolveFlexibleLengths(sizes, weights, mins, maxes, availableMain, "grow")
}

function distributeShrink(sizes: number[], weights: number[], mins: number[], maxes: number[], availableMain: number) {
  resolveFlexibleLengths(sizes, weights, mins, maxes, availableMain, "shrink")
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
  const freeSpace = itemAvail - baseSum

  if (freeSpace > FLEX_EPSILON && totalGrow > 0) distributeGrow(sizes, growWeights, mins, maxes, itemAvail)
  if (freeSpace < -FLEX_EPSILON && totalShrink > 0) distributeShrink(sizes, shrinkWeights, mins, maxes, itemAvail)

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
