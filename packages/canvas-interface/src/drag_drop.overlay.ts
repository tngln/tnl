import type { Rect, Vec2 } from "./ui_base"
import { UIElement } from "./ui_base"
import type { DragDropController, DragImageSpec } from "./drag_drop"
import { ZERO_RECT } from "./draw"

function dragImageRect(pointer: Vec2, image: DragImageSpec): Rect {
  const offset = image.offsetCss ?? { x: -image.sizeCss.x / 2, y: -image.sizeCss.y / 2 }
  return {
    x: pointer.x + offset.x,
    y: pointer.y + offset.y,
    w: image.sizeCss.x,
    h: image.sizeCss.y,
  }
}

export class DragImageOverlay extends UIElement {
  private readonly dd: DragDropController

  constructor(dd: DragDropController) {
    super()
    this.dd = dd
    this.z = 9_000_000
  }

  bounds(): Rect {
    const active = this.dd.getActive()
    const image = active?.dragImage ?? null
    if (!active || !image) return ZERO_RECT
    return dragImageRect(active.current, image)
  }

  protected containsPoint() {
    return false
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const active = this.dd.getActive()
    const image = active?.dragImage ?? null
    if (!active || !image) return
    const rt = this.renderRuntime()
    const comp = rt?.compositor
    if (!comp) return

    const dpr = rt?.dpr ?? 1
    const dest = dragImageRect(active.current, image)
    const layerId = "overlay:drag-image"
    comp.withLayer(layerId, dest.w, dest.h, dpr, (lctx) => {
      ;(lctx as any).clearRect(0, 0, dest.w, dest.h)
      ;(lctx as any).drawImage(image.source as any, 0, 0, dest.w, dest.h)
    })
    comp.blit(layerId, dest, { opacity: image.opacity })
  }
}
