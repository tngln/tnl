import type { Rect } from "../../core/rect"
import { InteractiveElement } from "./interactive"

export class ClickArea extends InteractiveElement {
  private readonly onClick: (() => void) | undefined

  constructor(opts: { rect: () => Rect; onClick?: () => void; active?: () => boolean; disabled?: () => boolean }) {
    super(opts)
    this.onClick = opts.onClick
  }

  protected onActivate() {
    this.onClick?.()
  }

  protected onDraw(_ctx: CanvasRenderingContext2D) {}
}

