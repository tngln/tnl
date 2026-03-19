import { create1pxTextControlBridge, type OnePxTextBridge, type OnePxTextSession, type OnePxTextState, type OnePxTextSyncState } from "./1px_text_control"

export type OnePxTextareaState = OnePxTextState
export type OnePxTextareaSession = OnePxTextSession
export type OnePxTextareaSyncState = OnePxTextSyncState

export type OnePxTextareaBridge = Omit<OnePxTextBridge<HTMLTextAreaElement>, "debugNode"> & {
  debugTextarea(): HTMLTextAreaElement | null
}

const TEXTAREA_ID = "tnl-1px-textarea"

function createBridge(): OnePxTextareaBridge {
  const bridge = create1pxTextControlBridge<HTMLTextAreaElement>({
    elementId: TEXTAREA_ID,
    createNode: () => document.createElement("textarea"),
    initNode: (node) => {
      node.autocomplete = "off"
      node.spellcheck = false
      node.readOnly = true
      node.wrap = "off"
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
      node.style.resize = "none"
      node.style.overflow = "hidden"
      node.style.whiteSpace = "pre"
    },
  })
  return {
    focus: bridge.focus,
    sync: bridge.sync,
    blur: bridge.blur,
    isFocused: bridge.isFocused,
    debugTextarea: () => bridge.debugNode(),
  }
}

let singleton: OnePxTextareaBridge | null = null

export function get1pxTextareaBridge() {
  singleton ??= createBridge()
  return singleton
}

export function reset1pxTextareaBridgeForTests() {
  singleton = null
}

