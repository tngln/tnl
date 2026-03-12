export type OnePxTextState = {
  value: string
  selectionStart: number
  selectionEnd: number
}

export type OnePxTextSession = {
  id: string
  onStateChange(next: OnePxTextState): void
  onBlur?(): void
}

export type OnePxTextSyncState = OnePxTextState & {
  caretRectCss?: { x: number; y: number; w: number; h: number } | null
}

export type OnePxTextBridge<TNode> = {
  focus(session: OnePxTextSession, state: OnePxTextSyncState): void
  sync(sessionId: string, state: OnePxTextSyncState): void
  blur(sessionId: string): void
  isFocused(sessionId: string): boolean
  debugNode(): TNode | null
}

type MinimalTextControl = {
  id: string
  value: string
  selectionStart: number | null
  selectionEnd: number | null
  style?: { left: string; top: string } | null
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void
  setSelectionRange?: (start: number, end: number) => void
  focus?: (opts?: FocusOptions) => void
  blur?: () => void
}

function clampSelection(value: string, selectionStart: number, selectionEnd: number) {
  const max = value.length
  const start = Math.max(0, Math.min(max, selectionStart))
  const end = Math.max(start, Math.min(max, selectionEnd))
  return { selectionStart: start, selectionEnd: end }
}

function normalizeState(state: OnePxTextState): OnePxTextState {
  const selection = clampSelection(state.value, state.selectionStart, state.selectionEnd)
  return {
    value: state.value,
    selectionStart: selection.selectionStart,
    selectionEnd: selection.selectionEnd,
  }
}

function sameState(a: OnePxTextState | null, b: OnePxTextState | null) {
  if (!a || !b) return false
  return a.value === b.value && a.selectionStart === b.selectionStart && a.selectionEnd === b.selectionEnd
}

function applyNodeState(node: MinimalTextControl, state: OnePxTextSyncState) {
  if (node.value !== state.value) node.value = state.value
  const selection = clampSelection(state.value, state.selectionStart, state.selectionEnd)
  const currentStart = node.selectionStart ?? 0
  const currentEnd = node.selectionEnd ?? currentStart
  if (currentStart !== selection.selectionStart || currentEnd !== selection.selectionEnd) {
    node.setSelectionRange?.(selection.selectionStart, selection.selectionEnd)
  }

  const caretRect = state.caretRectCss
  if (node.style) {
    if (caretRect) {
      node.style.left = `${Math.round(caretRect.x)}px`
      node.style.top = `${Math.round(caretRect.y)}px`
    } else {
      node.style.left = "0px"
      node.style.top = "0px"
    }
  }
}

export function create1pxTextControlBridge<TNode extends MinimalTextControl>(opts: {
  elementId: string
  createNode: () => TNode
  initNode: (node: TNode) => void
}): OnePxTextBridge<TNode> {
  let node: TNode | null = null
  let current: OnePxTextSession | null = null
  let focusToken = 0
  let suppressNotify = 0
  let lastForwardedState: OnePxTextState | null = null

  const withSuppressedNotify = <T>(run: () => T) => {
    suppressNotify += 1
    try {
      return run()
    } finally {
      suppressNotify -= 1
    }
  }

  const scheduleFocus = (nextNode: TNode, sessionId: string, state: OnePxTextSyncState) => {
    const token = ++focusToken
    setTimeout(() => {
      if (token !== focusToken) return
      if (!current || current.id !== sessionId) return
      nextNode.focus?.({ preventScroll: true } as any)
      withSuppressedNotify(() => applyNodeState(nextNode, state))
    }, 0)
  }

  const ensureNode = () => {
    if (typeof document === "undefined") return null
    let found = document.getElementById(opts.elementId) as any as TNode | null
    if (!found) {
      found = opts.createNode()
      found.id = opts.elementId
      opts.initNode(found)
      document.body.appendChild(found as any)
    }
    if (node === found) return found
    node = found

    const notifyState = () => {
      if (suppressNotify > 0) return
      if (!current || !node) return
      const next = normalizeState({
        value: node.value,
        selectionStart: node.selectionStart ?? 0,
        selectionEnd: node.selectionEnd ?? node.selectionStart ?? 0,
      })
      if (sameState(lastForwardedState, next)) return
      lastForwardedState = next
      current.onStateChange(next)
    }

    node.addEventListener?.("input", notifyState as any)
    node.addEventListener?.("select", notifyState as any)
    node.addEventListener?.(
      "blur",
      (() => {
        const session = current
        current = null
        lastForwardedState = null
        session?.onBlur?.()
      }) as any,
    )

    return node
  }

  return {
    focus(session, state) {
      const nextNode = ensureNode()
      current = session
      lastForwardedState = normalizeState(state)
      if (!nextNode) return
      withSuppressedNotify(() => applyNodeState(nextNode, state))
      scheduleFocus(nextNode, session.id, state)
    },

    sync(sessionId, state) {
      if (!current || current.id !== sessionId) return
      const nextNode = ensureNode()
      if (!nextNode) return
      lastForwardedState = normalizeState(state)
      withSuppressedNotify(() => applyNodeState(nextNode, state))
      if (typeof document !== "undefined" && (document as any).activeElement !== nextNode) {
        scheduleFocus(nextNode, sessionId, state)
      }
    },

    blur(sessionId) {
      if (!current || current.id !== sessionId) return
      const nextNode = ensureNode()
      focusToken += 1
      current = null
      lastForwardedState = null
      nextNode?.blur?.()
    },

    isFocused(sessionId) {
      return current?.id === sessionId
    },

    debugNode() {
      return ensureNode()
    },
  }
}
