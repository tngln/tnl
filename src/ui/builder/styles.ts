import { theme } from "../../config/theme"
import type { RichTextStyle, TextEmphasis } from "../../core/draw.text"
import type { InheritedStyle, InheritedSurfaceStyle, InheritedTextStyle, TextNode } from "./types"

export function defaultBodyStyle(): RichTextStyle {
  return {
    fontFamily: theme.typography.family,
    fontSize: theme.typography.body.size,
    fontWeight: theme.typography.body.weight,
    lineHeight: theme.spacing.lg,
    color: theme.colors.textPrimary,
  }
}

export function defaultInheritedStyle(): InheritedStyle {
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

export function mergeInheritedStyle(base: InheritedStyle, patch: Partial<InheritedStyle> | undefined): InheritedStyle {
  if (!patch) return base
  return {
    text: mergeTextStyle(base.text, patch.text),
    surface: mergeSurfaceStyle(base.surface, patch.surface),
  }
}

export function inheritedTextToRichTextStyle(text: InheritedTextStyle | undefined): RichTextStyle {
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: text?.fontWeight ?? theme.typography.body.weight,
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
    color: text?.color ?? theme.colors.textPrimary,
  }
}

export function resolveTextStyle(inherited: InheritedStyle, node: TextNode): RichTextStyle {
  const text = inherited.text
  return {
    fontFamily: text?.fontFamily ?? theme.typography.family,
    fontSize: text?.fontSize ?? theme.typography.body.size,
    fontWeight: node.emphasis?.bold ? 700 : (text?.fontWeight ?? theme.typography.body.weight),
    lineHeight: text?.lineHeight ?? theme.spacing.lg,
  }
}

export function resolveTextColor(inherited: InheritedStyle, node: TextNode) {
  return node.color ?? inherited.text?.color ?? theme.colors.textPrimary
}

export function resolveTextEmphasis(inherited: InheritedStyle, node: TextNode): TextEmphasis | undefined {
  return node.emphasis ?? inherited.text?.emphasis
}
