import { signal, type Signal } from "../../core/reactivity"
import { draw, Line, Rect as RectOp, RRect, Text } from "../../core/draw"
import { clamp } from "../../core/rect"
import { theme } from "../../config/theme"
import { UIElement, type Rect, type Vec2, WheelUIEvent, pointInRect } from "../base/ui"
import { ViewportElement, SurfaceRoot, type Surface, type ViewportContext } from "../base/viewport"
import { InteractiveElement } from "../widgets/interactive"
import { Scrollbar } from "../widgets"

class TabButton extends InteractiveElement {
  private readonly text: () => string
  private readonly selected: () => boolean
  private readonly onSelect: () => void
  private readonly coverLineY: () => number
  private readonly coverColor: string

  constructor(opts: { rect: () => Rect; text: () => string; selected: () => boolean; onSelect: () => void; coverLineY: () => number; coverColor: string }) {
    super({ rect: opts.rect })
    this.text = opts.text
    this.selected = opts.selected
    this.onSelect = opts.onSelect
    this.coverLineY = opts.coverLineY
    this.coverColor = opts.coverColor
    this.z = 10
  }

  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this._rect()
    const sel = this.selected()
    const bg = sel ? "rgba(255,255,255,0.06)" : this.down ? "rgba(255,255,255,0.05)" : this.hover ? "rgba(255,255,255,0.04)" : "transparent"
    const stroke = sel || this.hover ? { color: "rgba(255,255,255,0.14)", hairline: true } : undefined
    if (bg !== "transparent" || stroke) draw(ctx, RRect({ x: r.x, y: r.y, w: r.w, h: r.h, r: 6 }, { fill: bg !== "transparent" ? { color: bg } : undefined, stroke, pixelSnap: true }))
    draw(
      ctx,
      Text({
        x: r.x + r.w / 2,
        y: r.y + r.h / 2 + 0.5,
        text: this.text().toUpperCase(),
        style: {
          color: sel ? theme.colors.textPrimary : theme.colors.textMuted,
          font: `${600} ${Math.max(10, theme.typography.body.size - 1)}px ${theme.typography.family}`,
          align: "center",
          baseline: "middle",
        },
      }),
    )
    if (sel) {
      const y = this.coverLineY()
      draw(ctx, Line({ x: r.x + 6, y }, { x: r.x + r.w - 6, y }, { color: this.coverColor, width: 2 }))
    }
  }

  protected onActivate() {
    this.onSelect()
  }
}

export type TabSpec = { id: string; title: string; surface: Surface }

export class TabPanelSurface implements Surface {
  readonly id: string
  private readonly root = new SurfaceRoot()
  private size: Vec2 = { x: 0, y: 0 }
  private readonly contentScroll: Vec2 = { x: 0, y: 0 }
  private contentExtent: Vec2 = { x: 0, y: 0 }
  private readonly tabs: TabSpec[]
  private readonly selectedId: Signal<string>
  private readonly contentViewport: ViewportElement
  private readonly contentPadding = theme.spacing.sm
  private readonly scrollbar: Scrollbar | null
  private lastSurface: Surface | null = null
  private readonly tabBarH = 24

  constructor(opts: { id: string; tabs: TabSpec[]; selectedId?: string; scrollbar?: boolean }) {
    this.id = opts.id
    this.tabs = opts.tabs
    this.selectedId = signal(opts.selectedId ?? (opts.tabs[0]?.id ?? ""))

    const containerFill = "rgba(255,255,255,0.02)"
    const tabW = 82
    const gap = 4
    const pad = theme.spacing.xs
    const dividerY = () => this.tabBarH + 0.5
    const contentY = () => this.tabBarH

    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i]
      this.root.add(
        new TabButton({
          rect: () => ({
            x: pad + i * (tabW + gap),
            y: 1,
            w: tabW,
            h: this.tabBarH - 1,
          }),
          text: () => tab.title,
          selected: () => this.selectedId.peek() === tab.id,
          onSelect: () => this.selectedId.set(tab.id),
          coverLineY: dividerY,
          coverColor: containerFill,
        }),
      )
    }

    this.root.add(
      new TabBarDivider({
        rect: () => ({ x: 0, y: dividerY(), w: this.size.x, h: 1 }),
      }),
    )

    this.contentViewport = new ViewportElement({
      rect: () => ({ x: 0, y: contentY(), w: this.size.x, h: Math.max(0, this.size.y - contentY()) }),
      target: this.currentSurface(),
      options: { clip: true, padding: this.contentPadding, scroll: this.contentScroll },
    })
    this.contentViewport.z = 1
    this.root.add(this.contentViewport)

    if (opts.scrollbar) {
      this.scrollbar = new Scrollbar({
        rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: contentY() + 2, w: 10, h: Math.max(0, this.size.y - contentY() - 4) }),
        axis: "y",
        viewportSize: () => this.contentViewportSize().y,
        contentSize: () => this.contentExtent.y,
        value: () => this.contentScroll.y,
        onChange: (next) => {
          this.contentScroll.y = next
        },
      })
      this.root.add(this.scrollbar)
    } else {
      this.scrollbar = null
    }
  }

  private currentSurface(): Surface | null {
    const id = this.selectedId.peek()
    return this.tabs.find((t) => t.id === id)?.surface ?? this.tabs[0]?.surface ?? null
  }

  private contentViewportSize(): Vec2 {
    const outerH = Math.max(0, this.size.y - this.tabBarH)
    return {
      x: Math.max(0, this.size.x - this.contentPadding * 2),
      y: Math.max(0, outerH - this.contentPadding * 2),
    }
  }

  private maxScrollY() {
    const view = this.contentViewportSize()
    return Math.max(0, this.contentExtent.y - view.y)
  }

  private scrollBy(dy: number) {
    const maxY = this.maxScrollY()
    const next = clamp(this.contentScroll.y + dy, 0, maxY)
    if (next === this.contentScroll.y) return false
    this.contentScroll.y = next
    return true
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }

    draw(ctx as any, RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.02)" }, stroke: { color: "rgba(255,255,255,0.10)", hairline: true }, pixelSnap: true }))
    draw(ctx as any, RectOp({ x: 0, y: 0, w: this.size.x, h: this.tabBarH }, { fill: { color: "rgba(255,255,255,0.015)" } }))

    const s = this.currentSurface()
    if (s !== this.lastSurface) {
      this.lastSurface = s
      this.contentViewport.setTarget(s)
      this.contentScroll.y = 0
    }

    const viewSize = this.contentViewportSize()
    const measured = s?.contentSize?.(viewSize) ?? viewSize
    this.contentExtent = {
      x: Math.max(viewSize.x, measured.x),
      y: Math.max(viewSize.y, measured.y),
    }
    const maxY = this.maxScrollY()
    this.contentScroll.y = clamp(this.contentScroll.y, 0, maxY)

    this.root.draw(ctx as any)
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    const contentRect = { x: 0, y: this.tabBarH, w: this.size.x, h: Math.max(0, this.size.y - this.tabBarH) }
    if (!pointInRect({ x: e.x, y: e.y }, contentRect)) return
    const delta = Math.abs(e.deltaY) > 0.001 ? e.deltaY : e.deltaX
    if (Math.abs(delta) <= 0.001) return
    if (!this.scrollBy(delta)) return
    e.handle()
  }
}

class TabBarDivider extends UIElement {
  private readonly rect: () => Rect
  constructor(opts: { rect: () => Rect }) {
    super()
    this.rect = opts.rect
    this.z = 2
  }
  bounds(): Rect {
    return this.rect()
  }
  protected onDraw(ctx: CanvasRenderingContext2D) {
    const r = this.rect()
    draw(ctx, Line({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { color: "rgba(255,255,255,0.10)", hairline: true }))
  }
}
