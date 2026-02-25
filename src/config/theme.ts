export type Theme = {
  colors: {
    appBg: string
    windowBg: string
    windowTitleBg: string
    windowTitleText: string
    windowBorder: string
    windowDivider: string
    textPrimary: string
    textMuted: string
    textOnLightMuted: string
    closeHoverBg: string
    closeDownBg: string
    closeGlyph: string
    closeGlyphOnHover: string
  }
  spacing: {
    xs: number
    sm: number
    md: number
    lg: number
  }
  radii: {
    sm: number
  }
  shadows: {
    window: { color: string; blur: number; offsetX?: number; offsetY?: number }
  }
  typography: {
    family: string
    title: { size: number; weight: number }
    body: { size: number; weight: number }
    headline: { size: number; weight: number }
  }
  ui: {
    titleBarHeight: number
    closeButtonPad: number
  }
}

export function font(theme: Theme, spec: { size: number; weight: number }) {
  return `${spec.weight} ${spec.size}px ${theme.typography.family}`
}

export const theme: Theme = {
  colors: {
    appBg: "#0b0f17",
    windowBg: "#121825",
    windowTitleBg: "#e9edf3",
    windowTitleText: "#0b0f17",
    windowBorder: "rgba(255,255,255,0.18)",
    windowDivider: "#1a2233",
    textPrimary: "#e9edf3",
    textMuted: "rgba(233,237,243,0.75)",
    textOnLightMuted: "rgba(11,15,23,0.65)",
    closeHoverBg: "#e81123",
    closeDownBg: "#b32020",
    closeGlyph: "#0b0f17",
    closeGlyphOnHover: "#ffffff",
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
  },
  radii: {
    sm: 6,
  },
  shadows: {
    window: { color: "rgba(0,0,0,0.5)", blur: 18, offsetY: 6 },
  },
  typography: {
    family: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
    title: { size: 13, weight: 600 },
    body: { size: 12, weight: 400 },
    headline: { size: 16, weight: 600 },
  },
  ui: {
    titleBarHeight: 32,
    closeButtonPad: 6,
  },
}

