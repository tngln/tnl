import type { Rect } from "../draw"
import { drawVisualNode, type VisualContext, type VisualNode } from "./visual"

export type VisualHostState<TModel> = {
  rect: Rect
  model: TModel | null
  context: VisualContext
}

export function createVisualHostState<TModel>(): VisualHostState<TModel> {
  return {
    rect: { x: 0, y: 0, w: 0, h: 0 },
    model: null,
    context: { state: { hover: false, pressed: false, dragging: false, disabled: false } },
  }
}

export function updateVisualHostState<TModel>(state: VisualHostState<TModel>, next: {
  rect: Rect
  model: TModel | null
  context: VisualContext
}) {
  state.rect = next.rect
  state.model = next.model
  state.context = next.context
}

export function syncVisualHostState<TModel>(state: VisualHostState<TModel>, next: {
  rect: Rect
  model: TModel | null
  context: VisualContext
}) {
  updateVisualHostState(state, next)
  return state
}

export function drawVisualHost<TModel>(ctx: CanvasRenderingContext2D, state: VisualHostState<TModel>, build: (model: TModel) => VisualNode) {
  if (!state.model) return
  drawVisualNode(ctx, build(state.model), state.rect, state.context)
}
