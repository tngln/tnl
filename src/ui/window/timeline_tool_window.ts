import { ViewportElement } from "../base/viewport"
import { TimelineCompositeSurface } from "../surfaces/timeline_surface"
import { createFrameUnitAdapter } from "../timeline/model"
import { createTimelineDemoModel } from "../timeline/demo"
import { ModalWindow } from "./window"

export const TIMELINE_TOOL_WINDOW_ID = "Timeline.Tool"

export class TimelineToolWindow extends ModalWindow {
  private body = { x: 0, y: 0, w: 0, h: 0 }
  private readonly viewport: ViewportElement

  constructor() {
    super({
      id: TIMELINE_TOOL_WINDOW_ID,
      x: 360,
      y: 360,
      w: 900,
      h: 320,
      title: "Timeline",
      open: false,
      minW: 520,
      minH: 220,
      resizable: true,
      chrome: "tool",
      minimizable: false,
    })

    this.viewport = new ViewportElement({
      rect: () => this.body,
      target: new TimelineCompositeSurface({
        id: "Timeline.Demo",
        view: createTimelineDemoModel(),
        unitAdapter: createFrameUnitAdapter(1),
        initialPxPerUnit: 5,
        minPxPerUnit: 1,
        maxPxPerUnit: 28,
      }),
      options: { clip: true, padding: 0, active: () => this.open.peek() && !this.minimized.peek() },
    })
    this.viewport.z = 1
    this.add(this.viewport)
  }

  protected drawBody(_ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    this.body = { x, y, w, h }
  }
}
