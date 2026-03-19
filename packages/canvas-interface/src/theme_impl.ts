export type Theme = {
  colors: {
    text: string
    textMuted: string
    textDim: string
    hover: string
    pressed: string
    active: string
    disabled: string
    accent: string
    danger: string
    warning: string
    playhead: string
    closeBg: string
    closeBgPressed: string
    border: string
    borderFocus: string
    selection: string
    selectionBorder: string
    inputBg: string
    inputSelection: string
    slider: string
    sliderDim: string
    scrollThumb: string
    scrollThumbHover: string
    scrollThumbActive: string
    rowSelected: string
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

/** Tailwind-inspired neutral (slate) scale. Lower = lighter. */
export const neutral = {
  950: "#06090f",
  925: "#0b0f17",
  900: "#0f172a",
  875: "#121825",
  850: "#1a2233",
  800: "#1e293b",
  750: "#263245",
  700: "#334155",
  600: "#475569",
  500: "#64748b",
  400: "#7b8ca3",
  300: "#94a3b8",
  200: "#cbd5e1",
  100: "#e2e8f0",
  50: "#e9edf3",
} as const

/** Decorative palette for timeline clips and track items. */
export const clipPalette = [
  "#4f8cff", "#61b8ff", "#3f78ff", "#568dff",
  "#f0a23b", "#ffb74f", "#d9922d", "#e8a13e",
  "#3dc28a", "#46d198", "#34a877", "#6d8f5b",
  "#b876d9", "#c98af0", "#aa68cb",
  "#d65b7a", "#ef6d8f", "#c84f6c", "#e36b89",
  "#78839b", "#6d768c",
] as const

export const theme: Theme = {
  colors: {
    text: "#e9edf3",
    textMuted: "rgba(233,237,243,0.40)",
    textDim: "rgba(233,237,243,0.35)",
    hover: "rgba(233,237,243,0.08)",
    pressed: "rgba(233,237,243,0.12)",
    active: "rgba(233,237,243,0.16)",
    disabled: "rgba(233,237,243,0.03)",
    accent: "#3b82f6",
    danger: "rgba(255,120,120,0.95)",
    warning: "rgba(255,196,92,0.95)",
    playhead: "rgba(255,116,116,0.95)",
    closeBg: "#e81123",
    closeBgPressed: "#b32020",
    border: "rgba(255,255,255,0.16)",
    borderFocus: "rgba(140,190,255,0.88)",
    selection: "rgba(120,180,255,0.10)",
    selectionBorder: "rgba(120,180,255,0.35)",
    inputBg: "rgba(255,255,255,0.04)",
    inputSelection: "rgba(120,170,255,0.34)",
    slider: "rgba(124,183,255,0.72)",
    sliderDim: "rgba(145,170,210,0.22)",
    scrollThumb: "rgba(233,237,243,0.30)",
    scrollThumbHover: "rgba(233,237,243,0.38)",
    scrollThumbActive: "rgba(233,237,243,0.46)",
    rowSelected: "rgba(255,255,255,0.055)",
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
