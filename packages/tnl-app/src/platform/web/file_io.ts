type PickFilesOptions = {
  multiple?: boolean
  accept?: string
  inputId?: string
}

function ensureHiddenFileInput(id: string, accept?: string, multiple = true) {
  let input = document.getElementById(id) as HTMLInputElement | null
  if (!input) {
    input = document.createElement("input")
    input.id = id
    input.type = "file"
    input.style.position = "fixed"
    input.style.left = "-10000px"
    input.style.top = "-10000px"
    document.body.appendChild(input)
  }
  input.multiple = multiple
  input.accept = accept ?? ""
  return input
}

export function pickFiles(opts: PickFilesOptions = {}): Promise<File[]> {
  if (typeof document === "undefined") return Promise.resolve([])
  const input = ensureHiddenFileInput(opts.inputId ?? "tnl-devtools-file-input", opts.accept, opts.multiple ?? true)
  input.value = ""
  return new Promise((resolve) => {
    input.onchange = () => {
      const files = input.files ? [...input.files] : []
      input.onchange = null
      resolve(files)
    }
    input.click()
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  if (typeof document === "undefined") return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.style.display = "none"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
