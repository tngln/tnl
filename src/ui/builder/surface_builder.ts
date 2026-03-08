import { font, theme } from "../../config/theme"
import { type Signal } from "../../core/reactivity"
import { draw, Rect as RectOp, RRect, Text } from "../../core/draw"
import { createRichTextBlock, measureTextWidth, type RichTextSpan, type RichTextStyle, type TextEmphasis } from "../../core/draw.text"
import { layout, measureLayout, type LayoutNode, type LayoutStyle, type Rect as LayoutRect } from "../../core/layout"
import { ZERO_RECT } from "../../core/rect"
import { createMeasureContext } from "../../platform/web/canvas"
import { SurfaceRoot, ViewportElement, type Surface, type ViewportContext } from "../base/viewport"
import { UIElement, WheelUIEvent, pointInRect, type Rect, type Vec2 } from "../base/ui"
import { Button, Checkbox, Radio, Row, Scrollbar } from "../widgets"

export type BoxStyle = {
  fill?: string
  stroke?: string
  radius?: number
}

export type InheritedTextStyle = {
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  emphasis?: TextEmphasis
}

export type InheritedSurfaceStyle = {
  tone?: "default" | "subtle"
  density?: "comfortable" | "compact"
  panelFill?: string
  panelStroke?: string
  sectionFill?: string
  sectionStroke?: string
  scrollFill?: string
}

export type InheritedStyle = {
  text?: InheritedTextStyle
  surface?: InheritedSurfaceStyle
}

type NodeBase = {
  key?: string
  style?: LayoutStyle
  active?: boolean
  visible?: boolean
  box?: BoxStyle
  provideStyle?: Partial<InheritedStyle>
  styleOverride?: Partial<InheritedStyle>
}

export type CommonNodeProps = NodeBase

type ContainerNode = NodeBase & {
  kind: "row" | "column" | "stack"
  children: BuilderNode[]
}

type SpacerNode = NodeBase & {
  kind: "spacer"
}

type TextNode = NodeBase & {
  kind: "text"
  text: string
  color?: string
  emphasis?: TextEmphasis
}

type RichTextNode = NodeBase & {
  kind: "richText"
  spans: RichTextSpan[]
  textStyle?: RichTextStyle
  align?: "start" | "center" | "end"
}

type ButtonNode = NodeBase & {
  kind: "button"
  text: string
  title?: string
  onClick?: () => void
  disabled?: boolean
}

type CheckboxNode = NodeBase & {
  kind: "checkbox"
  label: string
  checked: Signal<boolean>
  disabled?: boolean
}

type RadioNode = NodeBase & {
  kind: "radio"
  label: string
  value: string
  selected: Signal<string>
  disabled?: boolean
}

export type RowVariant = "group" | "item"

type RowNode = NodeBase & {
  kind: "rowItem"
  leftText: string
  rightText?: string
  indent?: number
  variant?: RowVariant
  selected?: boolean
  onClick?: () => void
}

type ScrollAreaNode = NodeBase & {
  kind: "scrollArea"
  child: BuilderNode
}

export type BuilderNode =
  | ContainerNode
  | SpacerNode
  | TextNode
  | RichTextNode
  | ButtonNode
  | CheckboxNode
  | RadioNode
  | RowNode
  | ScrollAreaNode

export type SurfaceRender<P> = (props: P) => BuilderNode
export type SurfaceSetupResult<P> = SurfaceRender<P> | { render: SurfaceRender<P> }
export type SurfaceSetup<P> = (props: P) => SurfaceSetupResult<P>

export type SurfaceDefinition<P> = {
  readonly kind: "surface-definition"
  readonly displayName: string
  mount(props: P): FunctionalBuilderSurface<P>
}

export type SurfaceComponent<P> = SurfaceDefinition<P>

export type SurfaceMountSpec<P> = {
  kind: "surface-mount"
  definition: SurfaceDefinition<P>
  props: P
}

type AstNode = LayoutNode & {
  builder: BuilderNode
  inherited: InheritedStyle
  resolved: InheritedStyle
  children?: AstNode[]
}

type DrawOp = (ctx: CanvasRenderingContext2D) => void

type ButtonCell = {
  widget: Button
  rect: Rect
  text: string
  title?: string
  active: boolean
  disabled: boolean
  onClick?: () => void
  used: boolean
}

type CheckboxCell = {
  widget: Checkbox
  rect: Rect
  label: string
  checked: Signal<boolean>
  active: boolean
  disabled: boolean
  used: boolean
}

type RadioCell = {
  widget: Radio
  rect: Rect
  label: string
  value: string
  selected: Signal<string>
  active: boolean
  disabled: boolean
  used: boolean
}

type RowCell = {
  widget: Row
  rect: Rect
  leftText: string
  rightText?: string
  indent: number
  variant: "group" | "item"
  selected: boolean
  active: boolean
  onClick?: () => void
  used: boolean
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function defaultBodyStyle(): RichTextStyle {
  return {
    fontFamily: theme.typography.family,
    fontSize: theme.typography.body.size,
    fontWeight: theme.typography.body.weight,
    lineHeight: theme.spacing.lg,
  }
}

function defaultInheritedStyle(): InheritedStyle {
  return {
    text: {
      color: theme.colors.textPrimary,
      fontFamily: theme.typography.family,
      fontSize: theme.typography.body.size,
      fontWeight: theme.typography.body.weight,
      lineHeight: theme.spacing.lg,
    },
    surface: {
      tone: "default",
      density: "comfortable",
      panelFill: "rgba(255,255,255,0.02)",
      panelStroke: "rgba(255,255,255,0.10)",
      sectionFill: "rgba(255,255,255,0.02)",
      sectionStroke: "rgba(255,255,255,0.08)",
      scrollFill: "rgba(255,255,255,0.01)",
    },
  }
}

function mergeTextStyle(base: InheritedTextStyle | undefined, patch: InheritedTextStyle | undefined): InheritedTextStyle | undefined {
  if (!base && !patch) return undefined
  return {
    color: patch?.color ?? base?.color,
    fontFamily: patch?.fontFamily ?? base?.fontFamily,
    fontSize: patch?.fontSize ?? base?.fontSize,
    fontWeight: patch?.fontWeight ?? base?.fontWeight,
    lineHeight: patch?.lineHeight ?? base?.lineHeight,
    emphasis: patch?.emphasis ?? base?.emphasis,
  }
}

function mergeSurfaceStyle(base: InheritedSurfaceStyle | undefined, patch: InheritedSurfaceStyle | undefined): InheritedSurfaceStyle | undefined {
  if (!base && !patch) return undefined
  return {
    tone: patch?.tone ?? base?.tone,
    density: patch?.density ?? base?.density,
    panelFill: patch?.panelFill ?? base?.panelFill,
    panelStroke: patch?.panelStroke ?? base?.panelStroke,
    sectionFill: patch?.sectionFill ?? base?.sectionFill,
    sectionStroke: patch?.sectionStroke ?? base?.sectionStroke,
    scrollFill: patch?.scrollFill ?? base?.scrollFill,
  }
}

function mergeInheritedStyle(base: InheritedStyle, patch: Partial<InheritedStyle> | undefined): InheritedStyle {
  if (!patch) return base
  return {
    text: mergeTextStyle(base.text, patch.text),
    surface: mergeSurfaceStyle(base.surface, patch.surface),
  }
}

function inheritedTextToRichTextStyle(text: InheritedTextStyle | undefined): RichTextStyle {
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: text?.fontWeight ?? theme.typography.body.weight,
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
  }
}

function resolveTextStyle(inherited: InheritedStyle, node: TextNode): RichTextStyle {
  const text = inherited.text
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: node.emphasis?.bold ? 700 : (text?.fontWeight ?? theme.typography.body.weight),
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
  }
}

function resolveTextColor(inherited: InheritedStyle, node: TextNode) {
  return node.color ?? inherited.text?.color ?? theme.colors.textPrimary
}

function resolveTextEmphasis(inherited: InheritedStyle, node: TextNode) {
  return node.emphasis ?? inherited.text?.emphasis
}

function nodeVisible(node: BuilderNode) {
  return node.visible ?? true
}

function nodeActive(node: BuilderNode) {
  return (node.active ?? true) && nodeVisible(node)
}

function nodeKey(node: BuilderNode, path: string) {
  return node.key ?? path
}

function textFont(style: RichTextStyle, emphasis?: TextEmphasis) {
  const weight = emphasis?.bold ? 700 : (style.fontWeight ?? 400)
  const italic = emphasis?.italic ? "italic " : ""
  return `${italic}${weight} ${style.fontSize}px ${style.fontFamily}`
}

export class BuilderTreeSurface implements Surface {
  readonly id: string
  readonly engine: BuilderEngine
  private node: BuilderNode | null = null
  private wheelFallback: ((e: WheelUIEvent) => void) | null = null

  constructor(id: string) {
    this.id = id
    this.engine = new BuilderEngine()
  }

  setNode(node: BuilderNode | null) {
    this.node = node
  }

  setWheelFallback(fn: ((e: WheelUIEvent) => void) | null) {
    this.wheelFallback = fn
  }

  contentSize(viewportSize: Vec2) {
    if (!this.node) return viewportSize
    const ctx = createMeasureContext()
    if (!ctx) return viewportSize
    return this.engine.measureContentWithContext(ctx as CanvasRenderingContext2D, viewportSize, this.node)
  }

  measureWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2) {
    if (!this.node) return viewportSize
    return this.engine.measureContentWithContext(ctx, viewportSize, this.node)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    if (!this.node) return
    this.engine.render(ctx as CanvasRenderingContext2D, { x: viewport.contentRect.w, y: viewport.contentRect.h }, this.node)
  }

  hitTest(pSurface: Vec2) {
    return this.engine.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent) {
    this.wheelFallback?.(e)
  }
}

class BuilderScrollAreaElement extends UIElement {
  private rect: Rect = ZERO_RECT
  private active = false
  private readonly contentSurface: BuilderTreeSurface
  private readonly viewport: ViewportElement
  private readonly scrollbar: Scrollbar
  private scrollY = 0
  private contentH = 0

  constructor(id: string) {
    super()
    this.contentSurface = new BuilderTreeSurface(`${id}.Content`)
    this.contentSurface.setWheelFallback((e) => this.onContentWheel(e))
    this.viewport = new ViewportElement({
      rect: () => this.rect,
      target: this.contentSurface,
      options: { clip: true, scroll: () => ({ x: 0, y: this.scrollY }), active: () => this.active },
    })
    this.viewport.z = 1
    this.scrollbar = new Scrollbar({
      rect: () => ({
        x: this.rect.x + Math.max(0, this.rect.w - 12),
        y: this.rect.y + 2,
        w: 10,
        h: Math.max(0, this.rect.h - 4),
      }),
      axis: "y",
      viewportSize: () => Math.max(0, this.rect.h),
      contentSize: () => this.contentH,
      value: () => this.scrollY,
      onChange: (next) => {
        this.scrollY = clamp(next, 0, this.maxScroll())
      },
      active: () => this.active,
    })
    this.scrollbar.z = 10
    this.add(this.viewport)
    this.add(this.scrollbar)
  }

  private maxScroll() {
    return Math.max(0, this.contentH - this.rect.h)
  }

  private onContentWheel(e: WheelUIEvent) {
    const next = clamp(this.scrollY + e.deltaY, 0, this.maxScroll())
    if (next === this.scrollY) return
    this.scrollY = next
    e.handle()
  }

  set(next: { rect: Rect; active: boolean; child: BuilderNode }, measureCtx?: CanvasRenderingContext2D) {
    this.rect = next.rect
    this.active = next.active && next.rect.w > 0 && next.rect.h > 0
    this.contentSurface.setNode(next.child)
    const content = measureCtx
      ? this.contentSurface.measureWithContext(measureCtx, { x: Math.max(0, next.rect.w - 14), y: next.rect.h })
      : this.contentSurface.contentSize({ x: Math.max(0, next.rect.w - 14), y: next.rect.h })
    this.contentH = Math.max(next.rect.h, content.y)
    this.scrollY = clamp(this.scrollY, 0, this.maxScroll())
  }

  bounds() {
    if (!this.active) return ZERO_RECT
    return this.rect
  }
}

class BuilderEngine {
  readonly root = new SurfaceRoot()
  private readonly buttons = new Map<string, ButtonCell>()
  private readonly checkboxes = new Map<string, CheckboxCell>()
  private readonly radios = new Map<string, RadioCell>()
  private readonly rows = new Map<string, RowCell>()
  private readonly scrollAreas = new Map<string, BuilderScrollAreaElement>()
  private readonly richBlocks = new Map<string, ReturnType<typeof createRichTextBlock>>()
  private drawOps: DrawOp[] = []
  private readonly usedScrollAreas = new Set<string>()

  debugCounts() {
    return {
      buttons: this.buttons.size,
      checkboxes: this.checkboxes.size,
      radios: this.radios.size,
      rows: this.rows.size,
      scrollAreas: this.scrollAreas.size,
    }
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  measureContent(viewportSize: Vec2, node: BuilderNode) {
    const ctx = createMeasureContext()
    if (!ctx) return viewportSize
    return this.measureContentWithContext(ctx as CanvasRenderingContext2D, viewportSize, node)
  }

  measureContentWithContext(ctx: CanvasRenderingContext2D, viewportSize: Vec2, node: BuilderNode) {
    const ast = this.toAst(node, ctx, "root", defaultInheritedStyle())
    const measured = this.measureAst(ctx, ast, { w: viewportSize.x, h: Number.POSITIVE_INFINITY })
    return { x: Math.max(viewportSize.x, measured.w), y: Math.max(viewportSize.y, measured.h) }
  }

  render(ctx: CanvasRenderingContext2D, size: Vec2, node: BuilderNode) {
    for (const cell of this.buttons.values()) cell.used = false
    for (const cell of this.checkboxes.values()) cell.used = false
    for (const cell of this.radios.values()) cell.used = false
    for (const cell of this.rows.values()) cell.used = false
    this.usedScrollAreas.clear()
    this.drawOps = []

    const ast = this.toAst(node, ctx, "root", defaultInheritedStyle())
    const measured = this.measureAst(ctx, ast, { w: size.x, h: Number.POSITIVE_INFINITY })
    const outer = { x: 0, y: 0, w: size.x, h: Math.max(size.y, measured.h) }
    layout(ast, outer)
    this.mountAst(ctx, ast, "root")

    for (const op of this.drawOps) op(ctx)
    this.root.draw(ctx)
    this.deactivateUnused()
  }

  private deactivateUnused() {
    for (const cell of this.buttons.values()) if (!cell.used) cell.active = false
    for (const cell of this.checkboxes.values()) if (!cell.used) cell.active = false
    for (const cell of this.radios.values()) if (!cell.used) cell.active = false
    for (const cell of this.rows.values()) {
      if (cell.used) continue
      cell.active = false
      cell.widget.set({ rect: ZERO_RECT, leftText: "" })
    }
    for (const [key, area] of this.scrollAreas) {
      if (this.usedScrollAreas.has(key)) continue
      area.set({ rect: ZERO_RECT, active: false, child: spacer() })
    }
  }

  private toAst(node: BuilderNode, ctx: CanvasRenderingContext2D, path: string, inherited: InheritedStyle): AstNode {
    const nextInherited = mergeInheritedStyle(inherited, node.provideStyle)
    const resolved = mergeInheritedStyle(nextInherited, node.styleOverride)
    const ast: AstNode = {
      id: nodeKey(node, path),
      builder: node,
      inherited: nextInherited,
      resolved,
      style: node.style,
      measure: (max) => this.measureNode(ctx, node, max, path, resolved, nextInherited),
    }
    if (node.kind === "row" || node.kind === "column" || node.kind === "stack") {
      ast.style = { ...node.style, axis: node.kind }
      delete ast.measure
      ast.children = node.children.filter(nodeVisible).map((child, index) => this.toAst(child, ctx, `${path}/${index}`, nextInherited))
    }
    return ast
  }

  private measureAst(ctx: CanvasRenderingContext2D, ast: AstNode, max: { w: number; h: number }) {
    return ast.measure ? ast.measure(max) : measureLayout(ast, max)
  }

  private measureNode(ctx: CanvasRenderingContext2D, node: BuilderNode, max: { w: number; h: number }, path: string, resolved: InheritedStyle, inheritedForChildren: InheritedStyle): { w: number; h: number } {
    switch (node.kind) {
      case "text": {
        const style = resolveTextStyle(resolved, node)
        const f = textFont(style, resolveTextEmphasis(resolved, node))
        return { w: Math.min(max.w, measureTextWidth(ctx, node.text, f)), h: style.lineHeight }
      }
      case "richText": {
        const block = this.ensureRichBlock(nodeKey(node, path), node.spans, node.textStyle ?? inheritedTextToRichTextStyle(resolved.text), node.align)
        return block.measure(ctx, Math.max(0, max.w))
      }
      case "button": {
        const w = measureTextWidth(ctx, node.text, font(theme, theme.typography.body))
        return { w: Math.min(max.w, w + 28), h: 32 }
      }
      case "checkbox":
      case "radio": {
        const w = measureTextWidth(ctx, node.label, font(theme, theme.typography.body))
        return { w: Math.min(max.w, w + 28), h: 24 }
      }
      case "rowItem":
        return { w: max.w, h: 22 }
      case "scrollArea": {
        const childAst = this.toAst(node.child, ctx, `${path}/content`, inheritedForChildren)
        const child = measureLayout(childAst, { w: max.w, h: Number.POSITIVE_INFINITY })
        return { w: Math.min(max.w, child.w), h: Math.min(max.h, child.h) }
      }
      case "spacer":
        return { w: 0, h: 0 }
      case "row":
      case "column":
      case "stack": {
        const ast = this.toAst(node, ctx, path, inheritedForChildren)
        return measureLayout(ast, max)
      }
    }
  }

  private mountAst(ctx: CanvasRenderingContext2D, ast: AstNode, path: string) {
    const node = ast.builder
    const resolved = ast.resolved
    const rect = ast.rect ?? ZERO_RECT
    const active = nodeActive(node) && rect.w > 0 && rect.h > 0

    if (active && node.box && (node.box.fill || node.box.stroke)) {
      const fill = node.box.fill
      const stroke = node.box.stroke
      const radius = node.box.radius ?? theme.radii.sm
      this.drawOps.push((canvas) => {
        draw(
          canvas,
          RRect(
            { x: rect.x, y: rect.y, w: rect.w, h: rect.h, r: radius },
            {
              fill: fill ? { color: fill } : undefined,
              stroke: stroke ? { color: stroke, hairline: true } : undefined,
              pixelSnap: true,
            },
          ),
        )
      })
    }

    switch (node.kind) {
      case "row":
      case "column":
      case "stack":
        for (let i = 0; i < (ast.children?.length ?? 0); i++) this.mountAst(ctx, ast.children![i], `${path}/${i}`)
        return
      case "text":
        if (!active) return
        this.drawOps.push((canvas) => {
          const style = resolveTextStyle(resolved, node)
          draw(
            canvas,
            Text({
              x: rect.x,
              y: rect.y,
              text: node.text,
              style: {
                color: resolveTextColor(resolved, node),
                font: textFont(style, resolveTextEmphasis(resolved, node)),
                baseline: "top",
              },
            }),
          )
        })
        return
      case "richText":
        if (!active) return
        this.drawOps.push((canvas) => {
          const block = this.ensureRichBlock(nodeKey(node, path), node.spans, node.textStyle ?? inheritedTextToRichTextStyle(resolved.text), node.align)
          block.measure(canvas, rect.w)
          block.draw(canvas, { x: rect.x, y: rect.y })
        })
        return
      case "button":
        this.mountButton(nodeKey(node, path), rect, node, active)
        return
      case "checkbox":
        this.mountCheckbox(nodeKey(node, path), rect, node, active)
        return
      case "radio":
        this.mountRadio(nodeKey(node, path), rect, node, active)
        return
      case "rowItem":
        this.mountRow(nodeKey(node, path), rect, node, active)
        return
      case "scrollArea":
        this.mountScrollArea(ctx, nodeKey(node, path), rect, node, active)
        return
      case "spacer":
        return
    }
  }

  private ensureRichBlock(key: string, spans: RichTextSpan[], style: RichTextStyle, align?: "start" | "center" | "end") {
    const hit = this.richBlocks.get(key)
    if (hit) return hit
    const next = createRichTextBlock(spans, style, { align: align ?? "start", wrap: "word" })
    this.richBlocks.set(key, next)
    return next
  }

  private mountButton(key: string, rect: Rect, node: ButtonNode, active: boolean) {
    let cell = this.buttons.get(key)
    if (!cell) {
      cell = {
        rect,
        text: node.text,
        title: node.title,
        active,
        disabled: node.disabled ?? false,
        onClick: node.onClick,
        used: true,
        widget: new Button({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          text: () => cell!.text,
          title: () => cell!.title ?? cell!.text,
          onClick: () => cell!.onClick?.(),
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.buttons.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.text = node.text
    cell.title = node.title
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.onClick = node.onClick
    cell.used = true
  }

  private mountCheckbox(key: string, rect: Rect, node: CheckboxNode, active: boolean) {
    let cell = this.checkboxes.get(key)
    if (!cell) {
      cell = {
        rect,
        label: node.label,
        checked: node.checked,
        active,
        disabled: node.disabled ?? false,
        used: true,
        widget: new Checkbox({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          label: () => cell!.label,
          checked: node.checked,
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.checkboxes.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.label = node.label
    cell.checked = node.checked
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.used = true
  }

  private mountRadio(key: string, rect: Rect, node: RadioNode, active: boolean) {
    let cell = this.radios.get(key)
    if (!cell) {
      cell = {
        rect,
        label: node.label,
        value: node.value,
        selected: node.selected,
        active,
        disabled: node.disabled ?? false,
        used: true,
        widget: new Radio({
          rect: () => cell!.active ? cell!.rect : ZERO_RECT,
          label: () => cell!.label,
          value: node.value,
          selected: node.selected,
          active: () => cell!.active,
          disabled: () => cell!.disabled,
        }),
      }
      cell.widget.z = 10
      this.radios.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.label = node.label
    cell.value = node.value
    cell.selected = node.selected
    cell.active = active
    cell.disabled = node.disabled ?? false
    cell.used = true
  }

  private mountRow(key: string, rect: Rect, node: RowNode, active: boolean) {
    let cell = this.rows.get(key)
    if (!cell) {
      cell = {
        rect,
        leftText: node.leftText,
        rightText: node.rightText,
        indent: node.indent ?? 0,
        variant: node.variant ?? "item",
        selected: node.selected ?? false,
        active,
        onClick: node.onClick,
        used: true,
        widget: new Row(),
      }
      cell.widget.z = 10
      this.rows.set(key, cell)
      this.root.add(cell.widget)
    }
    cell.rect = rect
    cell.leftText = node.leftText
    cell.rightText = node.rightText
    cell.indent = node.indent ?? 0
    cell.variant = node.variant ?? "item"
    cell.selected = node.selected ?? false
    cell.active = active
    cell.onClick = node.onClick
    cell.used = true
    cell.widget.set(
      active
        ? {
            rect,
            leftText: node.leftText,
            rightText: node.rightText,
            indent: node.indent ?? 0,
            variant: node.variant ?? "item",
            selected: node.selected,
          }
        : { rect: ZERO_RECT, leftText: "" },
      active ? node.onClick : undefined,
    )
  }

  private mountScrollArea(ctx: CanvasRenderingContext2D, key: string, rect: Rect, node: ScrollAreaNode, active: boolean) {
    let area = this.scrollAreas.get(key)
    if (!area) {
      area = new BuilderScrollAreaElement(key)
      area.z = 5
      this.scrollAreas.set(key, area)
      this.root.add(area)
    }
    this.usedScrollAreas.add(key)
    area.set({ rect, active, child: node.child }, ctx)
  }
}

export class BuilderSurface implements Surface {
  readonly id: string
  private readonly tree: BuilderTreeSurface
  private readonly build: () => BuilderNode

  constructor(opts: { id: string; build: () => BuilderNode }) {
    this.id = opts.id
    this.tree = new BuilderTreeSurface(opts.id)
    this.build = opts.build
  }

  contentSize(viewportSize: Vec2) {
    const node = this.build()
    this.tree.setNode(node)
    return this.tree.contentSize(viewportSize)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.tree.setNode(this.build())
    this.tree.render(ctx, viewport)
  }

  hitTest(pSurface: Vec2) {
    return this.tree.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent, viewport: ViewportContext) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }
}

export class FunctionalBuilderSurface<P> implements Surface {
  readonly id: string
  private readonly tree: BuilderTreeSurface
  private readonly renderNode: SurfaceRender<P>
  private props: P

  constructor(opts: { id: string; props: P; setup: SurfaceSetup<P> }) {
    this.id = opts.id
    this.tree = new BuilderTreeSurface(opts.id)
    this.props = opts.props
    const result = opts.setup(opts.props)
    this.renderNode = typeof result === "function" ? result : result.render
  }

  setProps(props: P) {
    this.props = props
  }

  private buildNode() {
    return this.renderNode(this.props)
  }

  contentSize(viewportSize: Vec2) {
    const node = this.buildNode()
    this.tree.setNode(node)
    return this.tree.contentSize(viewportSize)
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.tree.setNode(this.buildNode())
    this.tree.render(ctx, viewport)
  }

  hitTest(pSurface: Vec2) {
    return this.tree.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent, _viewport: ViewportContext) {
    this.tree.onWheel?.(e)
  }

  debugCounts() {
    return this.tree.engine.debugCounts()
  }
}

export function defineSurface<P>(opts: {
  id: string | ((props: P) => string)
  setup: SurfaceSetup<P>
  displayName?: string
}): SurfaceDefinition<P> {
  return {
    kind: "surface-definition",
    displayName: opts.displayName ?? (typeof opts.id === "string" ? opts.id : "FunctionalBuilderSurface"),
    mount(props: P) {
      return new FunctionalBuilderSurface<P>({
        id: typeof opts.id === "function" ? opts.id(props) : opts.id,
        props,
        setup: opts.setup,
      })
    },
  }
}

export function mountSurface<P>(definition: SurfaceDefinition<P>, props: P) {
  return definition.mount(props)
}

export function surfaceMount<P>(definition: SurfaceDefinition<P>, props: P): SurfaceMountSpec<P> {
  return { kind: "surface-mount", definition, props }
}

export function isSurfaceMountSpec(value: unknown): value is SurfaceMountSpec<unknown> {
  return typeof value === "object" && value !== null && (value as SurfaceMountSpec<unknown>).kind === "surface-mount"
}

export function column(children: BuilderNode[], style?: LayoutStyle, base?: Omit<NodeBase, "style">): BuilderNode {
  return { kind: "column", children, style, ...base }
}

export function row(children: BuilderNode[], style?: LayoutStyle, base?: Omit<NodeBase, "style">): BuilderNode {
  return { kind: "row", children, style, ...base }
}

export function stack(children: BuilderNode[], style?: LayoutStyle, base?: Omit<NodeBase, "style">): BuilderNode {
  return { kind: "stack", children, style, ...base }
}

export function spacer(style?: LayoutStyle, base?: Omit<NodeBase, "style">): BuilderNode {
  return { kind: "spacer", style, ...base }
}

export function textNode(text: string, opts: Omit<TextNode, "kind" | "text"> = {}): BuilderNode {
  return { kind: "text", text, ...opts }
}

export function richTextNode(spans: RichTextSpan[], opts: Omit<RichTextNode, "kind" | "spans">): BuilderNode {
  return { kind: "richText", spans, ...opts }
}

export function buttonNode(text: string, opts: Omit<ButtonNode, "kind" | "text"> = {}): BuilderNode {
  return { kind: "button", text, ...opts }
}

export function checkboxNode(label: string, checked: Signal<boolean>, opts: Omit<CheckboxNode, "kind" | "label" | "checked"> = {}): BuilderNode {
  return { kind: "checkbox", label, checked, ...opts }
}

export function radioNode(label: string, value: string, selected: Signal<string>, opts: Omit<RadioNode, "kind" | "label" | "value" | "selected"> = {}): BuilderNode {
  return { kind: "radio", label, value, selected, ...opts }
}

export function rowItemNode(opts: Omit<RowNode, "kind">): BuilderNode {
  return { kind: "rowItem", ...opts }
}

export function scrollAreaNode(child: BuilderNode, opts: Omit<ScrollAreaNode, "kind" | "child"> = {}): BuilderNode {
  return { kind: "scrollArea", child, ...opts }
}

export function section(title: string, body: BuilderNode[], opts: Omit<NodeBase, "style"> & { style?: LayoutStyle } = {}): BuilderNode {
  return column(
    [
      textNode(title, {
        key: opts.key ? `${opts.key}.title` : undefined,
        emphasis: { bold: true },
        style: { margin: { b: theme.spacing.xs, l: 0, t: 0, r: 0 } },
      }),
      ...body,
    ],
    { padding: theme.spacing.md, ...(opts.style ?? {}) },
    {
      key: opts.key,
      box: opts.box ?? { fill: "rgba(255,255,255,0.02)", stroke: "rgba(255,255,255,0.08)" },
      active: opts.active,
      visible: opts.visible,
      provideStyle: opts.provideStyle,
      styleOverride: opts.styleOverride,
    },
  )
}

export function formRow(label: string, field: BuilderNode, opts: Omit<NodeBase, "style"> & { key?: string; labelWidth?: number; style?: LayoutStyle } = {}): BuilderNode {
  return row(
    [
      textNode(label, { key: opts.key ? `${opts.key}.label` : undefined, color: theme.colors.textMuted, style: { fixed: opts.labelWidth ?? 92 } }),
      field,
    ],
    { align: "center", gap: theme.spacing.sm, ...(opts.style ?? {}) },
    { key: opts.key, active: opts.active, visible: opts.visible, provideStyle: opts.provideStyle, styleOverride: opts.styleOverride, box: opts.box },
  )
}

export function toolbarRow(children: BuilderNode[], opts: Omit<NodeBase, "style"> & { key?: string; style?: LayoutStyle } = {}): BuilderNode {
  return row(children, { align: "center", gap: theme.spacing.sm, ...(opts.style ?? {}) }, { key: opts.key, active: opts.active, visible: opts.visible, provideStyle: opts.provideStyle, styleOverride: opts.styleOverride, box: opts.box })
}
