import { ModalWindow } from "./window"

export class ToolDialog extends ModalWindow {
  constructor(opts: {
    id: string
    x: number
    y: number
    w: number
    h: number
    title?: string
    open?: boolean
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
    resizable?: boolean
  }) {
    super({
      id: opts.id,
      x: opts.x,
      y: opts.y,
      w: opts.w,
      h: opts.h,
      title: opts.title ?? "",
      open: opts.open,
      minW: opts.minW,
      minH: opts.minH,
      maxW: opts.maxW,
      maxH: opts.maxH,
      resizable: opts.resizable,
      chrome: "tool",
      minimizable: false,
    })
  }
}

