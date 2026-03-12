export async function writeTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? "")
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
    }
  }

  if (typeof document === "undefined") return false
  const exec = (document as any).execCommand as ((commandId: string) => boolean) | undefined
  if (typeof exec !== "function") return false

  const prevActive = (document as any).activeElement as HTMLElement | null
  const textarea = document.createElement("textarea")
  textarea.value = value
  textarea.readOnly = true
  textarea.wrap = "off"
  textarea.style.position = "fixed"
  textarea.style.width = "1px"
  textarea.style.height = "1px"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"
  textarea.style.padding = "0"
  textarea.style.border = "0"
  textarea.style.margin = "0"
  textarea.style.left = "0px"
  textarea.style.top = "0px"
  textarea.style.resize = "none"
  textarea.style.overflow = "hidden"
  textarea.style.whiteSpace = "pre"
  document.body.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true } as any)
    textarea.select()
    return !!exec("copy")
  } catch {
    return false
  } finally {
    textarea.remove()
    prevActive?.focus?.()
  }
}

