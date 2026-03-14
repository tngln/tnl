export type Theme = {
  colors: {
    appBg: string
    windowBg: string
    windowTitleBg: string
    windowTitleText: string
    windowBorder: string
    windowDivider: string
    textPrimary: string
    textSecondary: string
    textMuted: string
    textOnLightMuted: string
    closeHoverBg: string
    closeDownBg: string
    closeGlyph: string
    closeGlyphOnHover: string
    inputBg: string
    inputBorder: string
    inputBorderFocus: string
    inputText: string
    inputPlaceholder: string
    inputSelectionBg: string
    inputDisabledBg: string
    controlHover: string
    controlPressed: string
    controlActive: string
    controlDisabled: string
    accent: string
    accentHover: string
    accentPressed: string
    accentText: string
    dangerText: string
    warningText: string
    playheadStroke: string
    playheadFill: string
    accentOverlay: string
    accentOutline: string
    accentOutlineStrong: string
    selectionFill: string
    selectionStroke: string
    scrollbarThumb: string
    scrollbarThumbHover: string
    scrollbarThumbActive: string
    rowSelectedBg: string
    paneBg92: string
    textDisabled: string
    textFaint: string
    textDim: string
    sliderFill: string
    sliderFillDisabled: string
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
    controls: {
      buttonHeight: number
      inputHeight: number
      choiceHeight: number
      rowHeight: number
      treeRowHeight: number
      menuItemHeight: number
      minFieldWidth: number
      labelPadX: number
      caretPadX: number
      rowTextPadX: number
      rowRightTextGap: number
      treeRow: {
        leftPad: number
        rightPad: number
        indentStep: number
        disclosureSlot: number
        disclosureGap: number
        rightTextGap: number
      }
    }
  }
}

export function font(theme: Theme, spec: { size: number; weight: number }) {
  return `${spec.weight} ${spec.size}px ${theme.typography.family}`
}

export function alpha(color: string, opacity: number) {
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${opacity})`
  }
  if (color.startsWith("rgba")) {
    return color.replace(/,[\d.]+\)$/, `,${opacity})`)
  }
  return color
}

export const neutral = {
  0: "#0f172a",
  1: "#1e293b",
  2: "#263245",
  3: "#334155",
  4: "#475569",
  5: "#64748b",
  6: "#7b8ca3",
  7: "#94a3b8",
  8: "#cbd5e1",
  9: "#e2e8f0",
} as const

export const theme: Theme = {
  colors: {
    appBg: "#0b0f17",
    windowBg: "#121825",
    windowTitleBg: "#e9edf3",
    windowTitleText: "#0b0f17",
    windowBorder: "rgba(255,255,255,0.18)",
    windowDivider: "#1a2233",
    textPrimary: "#e9edf3",
    textSecondary: "rgba(233,237,243,0.65)",
    textMuted: "rgba(233,237,243,0.40)",
    textOnLightMuted: "rgba(11,15,23,0.65)",
    closeHoverBg: "#e81123",
    closeDownBg: "#b32020",
    closeGlyph: "#0b0f17",
    closeGlyphOnHover: "#ffffff",
    inputBg: "rgba(255,255,255,0.04)",
    inputBorder: "rgba(255,255,255,0.16)",
    inputBorderFocus: "rgba(140,190,255,0.88)",
    inputText: "#e9edf3",
    inputPlaceholder: "rgba(233,237,243,0.40)",
    inputSelectionBg: "rgba(120,170,255,0.34)",
    inputDisabledBg: "rgba(255,255,255,0.025)",
    controlHover: "rgba(233,237,243,0.08)",
    controlPressed: "rgba(233,237,243,0.12)",
    controlActive: "rgba(233,237,243,0.16)",
    controlDisabled: "rgba(233,237,243,0.03)",
    accent: "#3b82f6",
    accentHover: "#2563eb",
    accentPressed: "#1d4ed8",
    accentText: "#ffffff",
    dangerText: "rgba(255,120,120,0.95)",
    warningText: "rgba(255,196,92,0.95)",
    playheadStroke: "rgba(255,116,116,0.95)",
    playheadFill: "rgba(255,116,116,0.92)",
    accentOverlay: "rgba(100,160,255,0.12)",
    accentOutline: "rgba(120,180,255,0.48)",
    accentOutlineStrong: "rgba(120,180,255,0.90)",
    selectionFill: "rgba(120,180,255,0.10)",
    selectionStroke: "rgba(120,180,255,0.35)",
    scrollbarThumb: "rgba(233,237,243,0.30)",
    scrollbarThumbHover: "rgba(233,237,243,0.38)",
    scrollbarThumbActive: "rgba(233,237,243,0.46)",
    rowSelectedBg: "rgba(255,255,255,0.055)",
    paneBg92: "rgba(20,26,36,0.92)",
    textDisabled: "rgba(233,237,243,0.38)",
    textFaint: "rgba(233,237,243,0.28)",
    textDim: "rgba(233,237,243,0.35)",
    sliderFill: "rgba(124,183,255,0.72)",
    sliderFillDisabled: "rgba(145,170,210,0.22)",
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
    controls: {
      buttonHeight: 32,
      inputHeight: 28,
      choiceHeight: 24,
      rowHeight: 22,
      treeRowHeight: 22,
      menuItemHeight: 22,
      minFieldWidth: 160,
      labelPadX: 8,
      caretPadX: 12,
      rowTextPadX: 8,
      rowRightTextGap: 12,
      treeRow: {
        leftPad: 8,
        rightPad: 8,
        indentStep: 12,
        disclosureSlot: 12,
        disclosureGap: 4,
        rightTextGap: 12,
      },
    },
  },
}
