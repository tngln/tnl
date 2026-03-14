import { theme } from "../../config/theme"
import type { RichTextStyle, TextEmphasis } from "../../core/draw.text"
import type { InheritedStyle, InheritedTextStyle, TextNode } from "./types"

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

export function mergeInheritedStyle(base: InheritedStyle, patch: Partial<InheritedStyle> | undefined): InheritedStyle {
  if (!patch) return base
  return {
    text: mergeTextStyle(base.text, patch.text),
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
