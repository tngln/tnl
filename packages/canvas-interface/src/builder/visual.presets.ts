import { theme } from "../theme"
import type { VisualStyleInput } from "./visual"

type FrameOpts = {
  minH?: number
  radius?: number
  paddingX?: number
  paddingY?: number
  fill?: string
  hoverFill?: string
  pressedFill?: string
  disabledFill?: string
  borderColor?: string | null
  disabledBorderColor?: string | null
  textColor?: string
  disabledTextColor?: string
  imageColor?: string
  disabledImageColor?: string
}

export function controlFrame(opts: FrameOpts = {}): VisualStyleInput {
  return {
    base: {
      layout: {
        padding: {
          left: opts.paddingX ?? 10,
          right: opts.paddingX ?? 10,
          top: opts.paddingY ?? 6,
          bottom: opts.paddingY ?? 6,
        },
        minH: opts.minH ?? theme.ui.controls.buttonHeight,
      },
      paint: { fill: opts.fill ?? "transparent" },
      border: { color: opts.borderColor ?? theme.colors.border, radius: opts.radius ?? theme.radii.sm },
      text: {
        color: opts.textColor ?? theme.colors.text,
        fontSize: theme.typography.body.size,
        fontWeight: theme.typography.body.weight,
        lineHeight: theme.spacing.lg,
        baseline: "middle",
        truncate: true,
      },
      image: {
        color: opts.imageColor ?? opts.textColor ?? theme.colors.text,
        width: 14,
        height: 14,
      },
    },
    hover: { paint: { fill: opts.hoverFill ?? theme.colors.hover } },
    pressed: { paint: { fill: opts.pressedFill ?? theme.colors.pressed } },
    disabled: {
      paint: { fill: opts.disabledFill ?? theme.colors.disabled },
      border: { color: opts.disabledBorderColor ?? theme.colors.border },
      text: { color: opts.disabledTextColor ?? theme.colors.textMuted },
      image: { color: opts.disabledImageColor ?? opts.disabledTextColor ?? theme.colors.textMuted },
    },
  }
}

export function choiceIndicator(opts: { radius?: number; size?: number } = {}): VisualStyleInput {
  const size = opts.size ?? 16
  return {
    base: {
      layout: { fixedW: size, fixedH: size },
      border: { color: theme.colors.border, radius: opts.radius ?? 4 },
      paint: { fill: "transparent" },
    },
    hover: { paint: { fill: theme.colors.hover } },
    pressed: { paint: { fill: theme.colors.pressed } },
    disabled: {
      border: { color: theme.colors.border },
      paint: { fill: theme.colors.disabled },
    },
  }
}

export function textControlFrame(opts: { minH?: number } = {}): VisualStyleInput {
  return {
    base: {
      layout: {
        padding: { left: 8, right: 8, top: 0, bottom: 0 },
        minH: opts.minH ?? theme.ui.controls.inputHeight,
        axis: "overlay",
      },
      paint: { fill: theme.colors.inputBg },
      border: { color: theme.colors.border, radius: theme.radii.sm },
      text: {
        color: theme.colors.text,
        fontSize: theme.typography.body.size,
        fontWeight: theme.typography.body.weight,
        lineHeight: theme.spacing.lg,
        baseline: "middle",
      },
      image: {
        color: theme.colors.textMuted,
        width: 10,
        height: 10,
      },
    },
    hover: { paint: { fill: theme.colors.hover } },
    disabled: {
      paint: { fill: theme.colors.disabled },
      text: { color: theme.colors.textMuted },
      image: { color: theme.colors.textMuted },
    },
  }
}

export function rowSurface(opts: { minH?: number; selectedFill?: string } = {}): VisualStyleInput {
  return {
    base: {
      layout: { axis: "row", align: "center", justify: "between", minH: opts.minH ?? theme.ui.controls.rowHeight },
      paint: { fill: "transparent" },
    },
    hover: { paint: { fill: theme.colors.hover } },
    pressed: { paint: { fill: theme.colors.pressed } },
    selected: { paint: { fill: opts.selectedFill ?? theme.colors.rowSelected } },
  }
}

export function iconLabelContent(opts: { gap?: number; justify?: "start" | "center" | "end" | "between" } = {}): VisualStyleInput {
  return {
    base: {
      layout: {
        axis: "row",
        align: "center",
        justify: opts.justify ?? "center",
        gap: opts.gap ?? 6,
        grow: true,
      },
    },
  }
}
