import type { IconDef } from "../icons"
import type { Rect } from "../draw"
import type { ControlState } from "./control"
import { controlFrame, iconLabelContent, rowSurface } from "./visual.presets"
import { buildChoiceIndicatorVisual, buildChoiceRootVisual } from "./widget_visuals"
import { drawVisualNode, mergeVisualStyles, normalizeImageSource, styled, type VisualContext, type VisualImageSource, type VisualNode, type VisualStyleInput } from "./visual"

type VisualControlCtx = {
  state: ControlState
  disabled?: boolean
  selected?: boolean
  checked?: boolean
}

function asVisualContext(state: VisualControlCtx): VisualContext {
  return {
    state: state.state,
    disabled: state.disabled,
    selected: state.selected,
    checked: state.checked,
  }
}

function renderControlVisual(ctx: CanvasRenderingContext2D, rect: Rect, node: VisualNode, state: VisualControlCtx) {
  drawVisualNode(ctx, node, rect, asVisualContext(state))
}

function buttonBaseStyle(): VisualStyleInput {
  return controlFrame()
}

function tooltipStyle(): VisualStyleInput {
  return {
    base: {
      layout: {
        padding: { left: 6, right: 6, top: 2, bottom: 2 },
        minH: 20,
        overlay: { anchor: "parent", y: -26 },
      },
      paint: { fill: "#0f172a" },
      border: { color: "#7b8ca3", radius: 6 },
      text: { color: "#e9edf3", fontSize: 12, fontWeight: 400, lineHeight: 18, align: "center" as const, baseline: "middle" as const },
    },
  }
}

export function buildButtonVisual(props: {
  text: string
  title?: string
  visualStyle?: VisualStyleInput
  leadingIcon?: VisualImageSource | IconDef | string
  trailingIcon?: VisualImageSource | IconDef | string
}, state: ControlState, disabled: boolean): VisualNode {
  const visualCtx = asVisualContext({ state, disabled })
  const baseStyle = buttonBaseStyle() as any
  const contentChildren: VisualNode[] = []
  if (props.leadingIcon) {
    contentChildren.push({
      kind: "image",
      source: normalizeImageSource(props.leadingIcon),
      style: { base: { image: { width: 14, height: 14 }, layout: { fixedW: 14, fixedH: 14 } } },
    })
  }
  contentChildren.push({
    kind: "text",
    text: props.text,
    style: {
      base: {
        text: { align: "center" as const, baseline: "middle" as const, truncate: true },
        layout: { grow: true, minH: 18 },
      },
    },
  })
  if (props.trailingIcon) {
    contentChildren.push({
      kind: "image",
      source: normalizeImageSource(props.trailingIcon),
      style: { base: { image: { width: 14, height: 14 }, layout: { fixedW: 14, fixedH: 14 } } },
    })
  }

  const title = props.title?.trim()
  return {
    kind: "box",
    style: styled({
      visualStyle: mergeVisualStyles(
        baseStyle,
        props.visualStyle,
        {
          base: {
            layout: {
              axis: "overlay",
            },
          },
        },
      ),
    }, visualCtx),
    children: [
      {
        kind: "box",
        style: iconLabelContent(),
        children: contentChildren,
      },
      ...(title && state.hover && !state.pressed && title !== props.text
        ? [{
            kind: "box" as const,
            style: tooltipStyle(),
            children: [{ kind: "text" as const, text: title }],
          }]
        : []),
    ],
  }
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  props: { text: string; title?: string; visualStyle?: VisualStyleInput; leadingIcon?: VisualImageSource | IconDef | string; trailingIcon?: VisualImageSource | IconDef | string },
  state: ControlState,
  disabled = false,
) {
  renderControlVisual(ctx, r, buildButtonVisual(props, state, disabled), { state, disabled })
}

function choiceRootStyle(visualStyle?: VisualStyleInput, visualCtx?: VisualContext): VisualStyleInput | undefined {
  return styled({ visualStyle: buildChoiceRootVisual(visualStyle, 8) }, visualCtx ?? { state: { hover: false, pressed: false, dragging: false, disabled: false } })
}

function indicatorStyle(checkedFill = false): VisualStyleInput {
  return buildChoiceIndicatorVisual(checkedFill)
}

export function buildCheckboxVisual(props: { label: string; checked: boolean; visualStyle?: VisualStyleInput }, visualCtx: VisualContext): VisualNode {
  return {
    kind: "box",
    style: choiceRootStyle(props.visualStyle, visualCtx),
    children: [
      {
        kind: "box",
        style: indicatorStyle(false),
        children: props.checked
          ? [
              { kind: "line", from: { x: 0.25, y: 0.55 }, to: { x: 0.45, y: 0.75 }, style: { base: { line: { color: visualCtx.disabled ? "rgba(233,237,243,0.40)" : "#e9edf3", width: 2, cap: "round" } } } },
              { kind: "line", from: { x: 0.45, y: 0.75 }, to: { x: 0.82, y: 0.30 }, style: { base: { line: { color: visualCtx.disabled ? "rgba(233,237,243,0.40)" : "#e9edf3", width: 2, cap: "round" } } } },
            ]
          : [],
      },
      {
        kind: "text",
        text: props.label,
        style: { base: { text: { color: visualCtx.disabled ? "rgba(233,237,243,0.40)" : "#e9edf3", fontSize: 12, lineHeight: 24 } } },
      },
    ],
  }
}

export function drawCheckbox(ctx: CanvasRenderingContext2D, r: Rect, props: { label: string; checked: boolean; visualStyle?: VisualStyleInput }, state: ControlState, disabled = false) {
  const visualCtx = asVisualContext({ state, disabled, checked: props.checked })
  renderControlVisual(ctx, r, buildCheckboxVisual(props, visualCtx), { state, disabled, checked: props.checked })
}

export function buildRadioVisual(props: { label: string; value: string; selected: string; visualStyle?: VisualStyleInput }, visualCtx: VisualContext): VisualNode {
  const checked = props.selected === props.value
  return {
    kind: "box",
    style: choiceRootStyle(props.visualStyle, visualCtx),
    children: [
      {
        kind: "box",
        style: {
          base: {
            layout: { fixedW: 16, fixedH: 16, axis: "overlay" },
            border: { color: "rgba(255,255,255,0.16)", radius: 999 },
          },
          disabled: { border: { color: "#7b8ca3" } },
        },
        children: checked
          ? [{
              kind: "box" as const,
              style: {
                base: {
                  layout: { fixedW: 8, fixedH: 8, overlay: { anchor: "content", x: 4, y: 4 } },
                  paint: { fill: visualCtx.disabled ? "rgba(233,237,243,0.40)" : "#e9edf3" },
                  border: { radius: 999 },
                },
              },
            }]
          : [],
      },
      {
        kind: "text",
        text: props.label,
        style: { base: { text: { color: visualCtx.disabled ? "rgba(233,237,243,0.40)" : "#e9edf3", fontSize: 12, lineHeight: 24 } } },
      },
    ],
  }
}

export function drawRadio(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  props: { label: string; value: string; selected: string; visualStyle?: VisualStyleInput },
  state: ControlState,
  disabled = false,
) {
  const visualCtx = asVisualContext({ state, disabled, checked: props.selected === props.value })
  renderControlVisual(ctx, r, buildRadioVisual(props, visualCtx), { state, disabled, checked: props.selected === props.value })
}

export type ListRowDrawProps = {
  leftText: string
  rightText?: string
  indent?: number
  variant?: "group" | "item"
  selected?: boolean
  visualStyle?: VisualStyleInput
}

export function buildListRowVisual(props: ListRowDrawProps, visualCtx: VisualContext): VisualNode {
  return {
    kind: "box",
    style: styled({
      visualStyle: mergeVisualStyles(
        rowSurface({ minH: 22, selectedFill: "rgba(255,255,255,0.055)" }),
        {
          base: {
            layout: { padding: { left: 8 + Math.max(0, props.indent ?? 0), right: 8 } },
            text: { color: props.variant === "group" ? "#e9edf3" : "rgba(233,237,243,0.40)", baseline: "middle" as const },
          },
        },
        props.visualStyle,
      ),
    }, visualCtx),
    children: [
      {
        kind: "text",
        text: props.leftText,
        style: {
          base: {
            text: {
              color: props.variant === "group" ? "#e9edf3" : "rgba(233,237,243,0.40)",
              fontSize: Math.max(10, 12 - 1),
              fontWeight: props.variant === "group" ? 600 : 500,
              lineHeight: 22,
              baseline: "middle" as const,
              truncate: true,
            },
            layout: { grow: true, minH: 22 },
          },
        },
      },
      ...(props.rightText
        ? [{
            kind: "text" as const,
            text: props.rightText,
            style: {
              base: {
                text: {
                  color: "rgba(233,237,243,0.40)",
                  fontSize: Math.max(10, 12 - 2),
                  fontWeight: 400,
                  lineHeight: 22,
                  align: "end" as const,
                  baseline: "middle" as const,
                  truncate: true,
                },
                layout: { minH: 22 },
              },
            },
          }]
        : []),
    ],
  }
}

export function drawListRow(ctx: CanvasRenderingContext2D, r: Rect, props: ListRowDrawProps, state: ControlState) {
  const visualCtx = asVisualContext({ state, selected: props.selected })
  renderControlVisual(ctx, r, buildListRowVisual(props, visualCtx), { state, selected: props.selected })
}

type SliderVisualProps = {
  min: number
  max: number
  value: number
  axis?: "x" | "y"
  thumbSize?: number
  trackThickness?: number
  visualStyle?: VisualStyleInput
}

function normalizeSlider(props: SliderVisualProps) {
  const thumbSize = Math.max(10, props.thumbSize ?? 12)
  const trackThickness = Math.max(3, props.trackThickness ?? 4)
  const normalized = props.max <= props.min ? 0 : Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min)))
  return { thumbSize, trackThickness, normalized }
}

export function drawSliderVisual(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  props: SliderVisualProps,
  state: ControlState,
  disabled = false,
) {
  const axis = props.axis ?? "x"
  const { thumbSize, trackThickness, normalized } = normalizeSlider(props)
  const visualCtx = asVisualContext({ state, disabled })
  const baseTrackStyle: VisualStyleInput = {
    base: {
      line: { color: disabled ? "#64748b" : "#7b8ca3", width: trackThickness, cap: "round" },
    },
    hover: { line: { color: "#94a3b8" } },
    pressed: { line: { color: "#cbd5e1" } },
  }
  const fillTrackStyle: VisualStyleInput = {
    base: {
      line: { color: disabled ? "rgba(145,170,210,0.22)" : "rgba(124,183,255,0.72)", width: trackThickness, cap: "round" },
    },
  }
  const thumbStyle: VisualStyleInput = styled({
    visualStyle: {
      base: {
        layout: { fixedW: thumbSize, fixedH: thumbSize, overlay: { anchor: "content", x: axis === "x" ? normalized * Math.max(0, rect.w - thumbSize) : (rect.w - thumbSize) / 2, y: axis === "y" ? (1 - normalized) * Math.max(0, rect.h - thumbSize) : (rect.h - thumbSize) / 2 } },
        border: { color: disabled ? "#7b8ca3" : "#334155", radius: Math.min(6, thumbSize / 2) },
        paint: { fill: disabled ? "rgba(233,237,243,0.03)" : "rgba(233,237,243,0.16)" },
      },
      hover: { paint: { fill: "rgba(233,237,243,0.08)" } },
      pressed: { paint: { fill: "rgba(233,237,243,0.12)" } },
    },
  }, visualCtx) ?? {}
  const fillEnd = axis === "y" ? { x: 0.5, y: 1 - normalized } : { x: normalized, y: 0.5 }
  renderControlVisual(
    ctx,
    rect,
    {
      kind: "box",
      style: { base: { layout: { axis: "overlay", minH: Math.max(20, thumbSize) } } },
      children: [
        {
          kind: "line",
          from: axis === "y" ? { x: 0.5, y: thumbSize / Math.max(rect.h, 1) / 2 } : { x: thumbSize / Math.max(rect.w, 1) / 2, y: 0.5 },
          to: axis === "y" ? { x: 0.5, y: 1 - thumbSize / Math.max(rect.h, 1) / 2 } : { x: 1 - thumbSize / Math.max(rect.w, 1) / 2, y: 0.5 },
          style: baseTrackStyle,
        },
        {
          kind: "line",
          from: axis === "y" ? { x: 0.5, y: 1 - thumbSize / Math.max(rect.h, 1) / 2 } : { x: thumbSize / Math.max(rect.w, 1) / 2, y: 0.5 },
          to: axis === "y" ? { x: 0.5, y: fillEnd.y } : { x: fillEnd.x, y: 0.5 },
          style: fillTrackStyle,
        },
        {
          kind: "box",
          style: thumbStyle,
        },
      ],
    },
    { state, disabled },
  )
}
