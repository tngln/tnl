import type { Rect } from "../../core/rect"
import { Menu, type MenuItem, MENU_ROW_HEIGHT } from "./menu"

export type DropdownMenuOption = { value: string; label: string }
export const DROPDOWN_MENU_ROW_HEIGHT = MENU_ROW_HEIGHT

export class DropdownMenu extends Menu {
  constructor(opts: {
    rect: () => Rect
    options: DropdownMenuOption[] | (() => DropdownMenuOption[])
    selected: any
    onSelect: (value: string) => void
    onDismiss: () => void
  }) {
    const getOptions: () => DropdownMenuOption[] =
      typeof opts.options === "function" ? (opts.options as () => DropdownMenuOption[]) : () => opts.options as DropdownMenuOption[]
    super({
      rect: opts.rect,
      items: () => getOptions().map((o) => ({ key: o.value, text: o.label } satisfies MenuItem)),
      selectedKey: () => String(opts.selected.peek()),
      onSelect: (key) => opts.onSelect(key),
      onDismiss: opts.onDismiss,
    })
  }
}
