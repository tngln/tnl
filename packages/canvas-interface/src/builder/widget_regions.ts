import type { Rect } from "../draw"
import { theme } from "../theme"

export type TreeRowRegionModel = {
  rect: Rect
  depth: number
}

export type TreeRowRegions = {
  primaryRect: Rect
  disclosureRect: Rect
}

export function resolveTreeRowRegions(model: TreeRowRegionModel): TreeRowRegions {
  const disclosureSlot = theme.ui.controls.treeRow.disclosureSlot
  return {
    primaryRect: model.rect,
    disclosureRect: {
      x: model.rect.x + theme.ui.controls.treeRow.leftPad + Math.max(0, model.depth) * theme.ui.controls.treeRow.indentStep,
      y: model.rect.y + Math.floor((model.rect.h - disclosureSlot) / 2),
      w: disclosureSlot,
      h: disclosureSlot,
    },
  }
}

export type DropdownRegionModel = {
  rect: Rect
  optionCount: number
}

export type DropdownRegions = {
  primaryRect: Rect
  anchorRect: Rect
  overlayRect: Rect
}

export function resolveDropdownRegions(model: DropdownRegionModel): DropdownRegions {
  const overlayRect = {
    x: model.rect.x,
    y: model.rect.y + model.rect.h + 2,
    w: model.rect.w,
    h: Math.max(0, model.optionCount * 22),
  }
  return {
    primaryRect: model.rect,
    anchorRect: model.rect,
    overlayRect,
  }
}

export type TextBoxRegionModel = {
  rect: Rect
  padX?: number
  scrollX?: number
  caretX?: number
}

export type TextBoxRegions = {
  primaryRect: Rect
  contentRect: Rect
  focusRegion: Rect
  anchorRect: Rect
}

export function resolveTextBoxRegions(model: TextBoxRegionModel): TextBoxRegions {
  const padX = model.padX ?? 8
  const innerW = Math.max(0, model.rect.w - padX * 2)
  const contentRect = {
    x: model.rect.x + padX,
    y: model.rect.y + 1,
    w: innerW,
    h: Math.max(0, model.rect.h - 2),
  }
  const caretX = model.caretX ?? contentRect.x - (model.scrollX ?? 0)
  return {
    primaryRect: model.rect,
    contentRect,
    focusRegion: {
      x: contentRect.x,
      y: model.rect.y,
      w: contentRect.w,
      h: model.rect.h,
    },
    anchorRect: {
      x: caretX,
      y: model.rect.y + 5,
      w: 1,
      h: Math.max(0, model.rect.h - 10),
    },
  }
}
