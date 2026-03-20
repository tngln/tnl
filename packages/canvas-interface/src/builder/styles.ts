import { theme } from "../theme"
import type { RichTextStyle } from "../draw"

export function defaultBodyStyle(): RichTextStyle {
  return {
    fontFamily: theme.typography.family,
    fontSize: theme.typography.body.size,
    fontWeight: theme.typography.body.weight,
    lineHeight: theme.spacing.lg,
    color: theme.colors.text,
  }
}
