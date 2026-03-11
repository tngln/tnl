export type OnePxTextboxState = {
  value: string
  selectionStart: number
  selectionEnd: number
}

export type OnePxTextboxSession = {
  id: string
  onStateChange(next: OnePxTextboxState): void
  onBlur?(): void
}

export type OnePxTextboxSyncState = OnePxTextboxState & {
  caretRectCss?: { x: number; y: number; w: number; h: number } | null
}

export type OnePxTextboxBridge = {
  focus(session: OnePxTextboxSession, state: OnePxTextboxSyncState): void
  sync(sessionId: string, state: OnePxTextboxSyncState): void
  blur(sessionId: string): void
  isFocused(sessionId: string): boolean
  debugInput(): HTMLInputElement | null
}

const INPUT_ID = "tnl-1px-textbox"

function clampSelection(value: string, selectionStart: number, selectionEnd: number) {
  const max = value.length
  const start = Math.max(0, Math.min(max, selectionStart))
  const end = Math.max(start, Math.min(max, selectionEnd))
  return { selectionStart: start, selectionEnd: end }
}

function normalizeState(state: OnePxTextboxState): OnePxTextboxState {
  const selection = clampSelection(state.value, state.selectionStart, state.selectionEnd)
  return {
    value: state.value,
    selectionStart: selection.selectionStart,
    selectionEnd: selection.selectionEnd,
  }
}

function sameState(a: OnePxTextboxState | null, b: OnePxTextboxState | null) {
  if (!a || !b) return false
  return a.value === b.value && a.selectionStart === b.selectionStart && a.selectionEnd === b.selectionEnd
}

function applyInputState(input: HTMLInputElement, state: OnePxTextboxSyncState) {
  if (input.value !== state.value) input.value = state.value
  const selection = clampSelection(state.value, state.selectionStart, state.selectionEnd)
  const currentStart = input.selectionStart ?? 0
  const currentEnd = input.selectionEnd ?? currentStart
  if (currentStart !== selection.selectionStart || currentEnd !== selection.selectionEnd) {
    input.setSelectionRange(selection.selectionStart, selection.selectionEnd)
  }

  const caretRect = state.caretRectCss
  if (caretRect) {
    input.style.left = `${Math.round(caretRect.x)}px`
    input.style.top = `${Math.round(caretRect.y)}px`
  } else {
    input.style.left = "0px"
    input.style.top = "0px"
  }
}

function createBridge(): OnePxTextboxBridge {
  let input: HTMLInputElement | null = null
  let current: OnePxTextboxSession | null = null
  let focusToken = 0
  let suppressNotify = 0
  let lastForwardedState: OnePxTextboxState | null = null

  const withSuppressedNotify = <T>(run: () => T) => {
    suppressNotify += 1
    try {
      return run()
    } finally {
      suppressNotify -= 1
    }
  }

  const scheduleFocus = (node: HTMLInputElement, sessionId: string, state: OnePxTextboxSyncState) => {
    const token = ++focusToken
    setTimeout(() => {
      if (token !== focusToken) return
      if (!current || current.id !== sessionId) return
      node.focus({ preventScroll: true })
      withSuppressedNotify(() => applyInputState(node, state))
    }, 0)
  }

  const ensureInput = () => {
    if (typeof document === "undefined") return null
    let node = document.getElementById(INPUT_ID) as HTMLInputElement | null
    if (!node) {
      node = document.createElement("input")
      node.id = INPUT_ID
      node.type = "text"
      node.autocomplete = "off"
      node.spellcheck = false
      node.style.position = "fixed"
      node.style.width = "1px"
      node.style.height = "1px"
      node.style.opacity = "0"
      node.style.pointerEvents = "none"
      node.style.padding = "0"
      node.style.border = "0"
      node.style.margin = "0"
      node.style.left = "0px"
      node.style.top = "0px"
      document.body.appendChild(node)
    }
    if (input === node) return node
    input = node

    const notifyState = () => {
      if (suppressNotify > 0) return
      if (!current || !input) return
      const next = normalizeState({
        value: input.value,
        selectionStart: input.selectionStart ?? 0,
        selectionEnd: input.selectionEnd ?? input.selectionStart ?? 0,
      })
      if (sameState(lastForwardedState, next)) return
      lastForwardedState = next
      current.onStateChange(next)
    }

    input.addEventListener("input", notifyState)
    input.addEventListener("select", notifyState)
    input.addEventListener("blur", () => {
      const session = current
      current = null
      lastForwardedState = null
      session?.onBlur?.()
    })
    return input
  }

  return {
    focus(session, state) {
      const node = ensureInput()
      current = session
      lastForwardedState = normalizeState(state)
      if (!node) return
      withSuppressedNotify(() => applyInputState(node, state))
      scheduleFocus(node, session.id, state)
    },

    sync(sessionId, state) {
      if (!current || current.id !== sessionId) return
      const node = ensureInput()
      if (!node) return
      lastForwardedState = normalizeState(state)
      withSuppressedNotify(() => applyInputState(node, state))
      if (typeof document !== "undefined" && document.activeElement !== node) {
        scheduleFocus(node, sessionId, state)
      }
    },

    blur(sessionId) {
      if (!current || current.id !== sessionId) return
      const node = ensureInput()
      focusToken += 1
      current = null
      lastForwardedState = null
      node?.blur()
    },

    isFocused(sessionId) {
      return current?.id === sessionId
    },

    debugInput() {
      return ensureInput()
    },
  }
}

let singleton: OnePxTextboxBridge | null = null

export function get1pxTextboxBridge() {
  singleton ??= createBridge()
  return singleton
}

export function reset1pxTextboxBridgeForTests() {
  singleton = null
}
