import { create1pxTextControlBridge, type OnePxTextBridge, type OnePxTextSession, type OnePxTextState, type OnePxTextSyncState } from "./1px_text_control"

export type OnePxTextboxState = OnePxTextState
export type OnePxTextboxSession = OnePxTextSession
export type OnePxTextboxSyncState = OnePxTextSyncState

export type OnePxTextboxBridge = Omit<OnePxTextBridge<HTMLInputElement>, "debugNode"> & {
  debugInput(): HTMLInputElement | null
}

const INPUT_ID = "tnl-1px-textbox"

function createBridge(): OnePxTextboxBridge {
  const bridge = create1pxTextControlBridge<HTMLInputElement>({
    elementId: INPUT_ID,
    createNode: () => document.createElement("input"),
    initNode: (node) => {
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
    },
  })
  return {
    focus: bridge.focus,
    sync: bridge.sync,
    blur: bridge.blur,
    isFocused: bridge.isFocused,
    debugInput: () => bridge.debugNode(),
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
