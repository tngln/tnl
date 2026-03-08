import { ControlsSurface } from "../surfaces/controls_surface"
import { DividerSurface } from "../surfaces/divider_surface"
import { TabPanelSurface } from "../surfaces/tab_panel_surface"
import { TextSurface } from "../surfaces/text_surface"
import { ViewportElement } from "../base/viewport"
import { ModalWindow } from "./window"

export const TOOLS_DIALOG_ID = "Tools.Dialog"

export class ToolsDialog extends ModalWindow {
  private body = { x: 0, y: 0, w: 0, h: 0 }
  private readonly viewport: ViewportElement

  constructor() {
    super({
      id: TOOLS_DIALOG_ID,
      x: 20,
      y: 520,
      w: 320,
      h: 220,
      title: "",
      open: false,
      resizable: true,
      minW: 240,
      minH: 160,
      chrome: "tool",
      minimizable: false,
    })

    const tabs = new TabPanelSurface({
      id: "Tools.Tabs",
      tabs: [
        {
          id: "scroll",
          title: "Scroll",
          surface: new TextSurface({
            id: "Tools.Scroll.Demo",
            title: "Wheel Scroll Demo",
            body:
              "Use the mouse wheel while the cursor is inside this content area. This panel is intentionally long so vertical scrolling is obvious. " +
              "Try slow wheel ticks and fast flicks, then resize this window to make the viewport shorter and verify that the scroll range grows. " +
              "You can also drag the scrollbar thumb on the right edge and then continue with wheel input; both paths should stay synchronized. " +
              "Expected behavior: scrolling is clamped at top and bottom, tab bar remains fixed, and switching tabs resets the panel scroll position. " +
              "Regression checks: Controls tab should remain interactive, Split tab divider should still drag correctly, and opening Developer window should keep its own scroll state independent from this dialog. " +
              "This text block repeats to force overflow. This text block repeats to force overflow. This text block repeats to force overflow. " +
              "This text block repeats to force overflow. This text block repeats to force overflow. This text block repeats to force overflow.",
          }),
        },
        { id: "controls", title: "Controls", surface: new ControlsSurface() },
        {
          id: "split",
          title: "Split",
          surface: new DividerSurface({
            id: "Tools.Split",
            a: new ControlsSurface(),
            b: new TextSurface({
              id: "Tools.Split.Info",
              title: "Divider",
              body: "A divider hosts two surfaces in one panel and lets you drag the handle to adjust the split position.",
            }),
            initial: 220,
            minA: 140,
            minB: 140,
            gutter: 10,
          }),
        },
        {
          id: "info",
          title: "Info",
          surface: new TextSurface({
            id: "Tools.Info",
            title: "Tabs",
            body: "A tab panel switches content surfaces within one window. Each tab can host its own Surface and Viewport constraints.",
          }),
        },
      ],
      selectedId: "scroll",
      scrollbar: true,
    })

    this.viewport = new ViewportElement({
      rect: () => this.body,
      target: tabs,
      options: { clip: true, padding: 0, active: () => this.open.peek() && !this.minimized.peek() },
    })
    this.viewport.z = 1
    this.add(this.viewport)
  }

  protected drawBody(ctx: CanvasRenderingContext2D, x: number, y: number, _w: number, _h: number) {
    this.body = { x, y, w: _w, h: _h }
  }
}
