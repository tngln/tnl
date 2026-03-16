export type ControlVisualState = {
  hover: boolean
  pressed: boolean
  disabled: boolean
  selected?: boolean
}

export function resolveControlFill(
  state: ControlVisualState,
  palette: {
    disabled: string
    pressed: string
    hover: string
    selected?: string
    idle?: string
  },
): string {
  if (state.disabled) return palette.disabled
  if (state.pressed) return palette.pressed
  if (state.selected && palette.selected) return palette.selected
  if (state.hover) return palette.hover
  return palette.idle ?? "transparent"
}

export function resolveControlTextColor(
  state: Pick<ControlVisualState, "disabled">,
  palette: {
    normal: string
    disabled: string
  },
): string {
  return state.disabled ? palette.disabled : palette.normal
}