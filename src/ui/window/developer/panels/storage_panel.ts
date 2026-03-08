import { draw, Rect as RectOp, RRect, Text } from "../../../../core/draw"
import { openOpfs, type OpfsEntryV1, OpfsError } from "../../../../core/opfs"
import { theme } from "../../../../config/theme"
import { signal } from "../../../../core/reactivity"
import { UIElement, type Rect, type Vec2, WheelUIEvent } from "../../../base/ui"
import type { Surface, ViewportContext } from "../../../base/viewport"
import { Button, Row, Scrollbar } from "../../../widgets"
import type { DeveloperPanelSpec } from "../index"

export function createStoragePanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Storage",
    title: "Storage",
    build: (_ctx) => new StoragePanelSurface(),
  }
}

class SurfaceRoot extends UIElement {
  bounds(): Rect {
    return { x: -1e9, y: -1e9, w: 2e9, h: 2e9 }
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function formatBytes(bytes: number) {
  const b = Math.max(0, bytes)
  if (b < 1024) return `${b} B`
  const units = ["KB", "MB", "GB", "TB"] as const
  let n = b / 1024
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u++
  }
  const digits = n < 10 ? 2 : n < 100 ? 1 : 0
  return `${n.toFixed(digits)} ${units[u]}`
}

function invalidateAll() {
  ;(globalThis as any).__TNL_DEVTOOLS__?.invalidate?.()
}

function ensureHiddenFileInput(): HTMLInputElement {
  const id = "tnl-devtools-file-input"
  let el = document.getElementById(id) as HTMLInputElement | null
  if (el) return el
  el = document.createElement("input")
  el.id = id
  el.type = "file"
  el.multiple = true
  el.style.position = "fixed"
  el.style.left = "-10000px"
  el.style.top = "-10000px"
  document.body.appendChild(el)
  return el
}

class StoragePanelSurface implements Surface {
  readonly id = "Developer.Storage.Surface"
  private readonly root = new SurfaceRoot()
  private size: Vec2 = { x: 0, y: 0 }

  private fsPromise: ReturnType<typeof openOpfs> | null = null
  private opSeq = 0

  private entries: OpfsEntryV1[] = []
  private usage: { entries: number; bytes: number; quota?: number; usage?: number } = { entries: 0, bytes: 0 }
  private error: string | null = null
  private busy = false
  private prefix: string | null = null
  private selectedPath: string | null = null

  private readonly scroll = signal(0)
  private contentH = 0
  private readonly scrollbar: Scrollbar
  private readonly rowWidgets: Row[] = []

  private readonly btnRefresh: Button
  private readonly btnUpload: Button
  private readonly btnDownload: Button
  private readonly btnDelete: Button
  private readonly btnEdit: Button
  private readonly btnPrefix: Button

  constructor() {
    const toolbarH = 28
    const btnW = 78
    const btnH = 22
    const y = 4
    const gap = 6

    this.btnRefresh = new Button({
      rect: () => ({ x: 6, y, w: btnW, h: btnH }),
      text: () => (this.busy ? "Refreshing" : "Refresh"),
      onClick: () => void this.refresh(),
    })
    this.btnUpload = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 1, y, w: btnW, h: btnH }),
      text: "Upload",
      onClick: () => void this.upload(),
    })
    this.btnDownload = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 2, y, w: btnW, h: btnH }),
      text: "Download",
      active: () => !!this.selectedPath,
      onClick: () => void this.downloadSelected(),
    })
    this.btnDelete = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 3, y, w: btnW, h: btnH }),
      text: "Delete",
      active: () => !!this.selectedPath,
      onClick: () => void this.deleteSelected(),
    })
    this.btnEdit = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 4, y, w: btnW, h: btnH }),
      text: "Edit Meta",
      active: () => !!this.selectedPath,
      onClick: () => void this.editSelectedMeta(),
    })
    this.btnPrefix = new Button({
      rect: () => ({ x: 6 + (btnW + gap) * 5, y, w: btnW, h: btnH }),
      text: () => (this.prefix ? "Prefix*" : "Prefix"),
      onClick: () => this.setPrefix(),
    })

    this.scrollbar = new Scrollbar({
      rect: () => ({ x: Math.max(0, this.size.x - 10 - 2), y: toolbarH + 2, w: 10, h: Math.max(0, this.size.y - toolbarH - 4) }),
      axis: "y",
      viewportSize: () => Math.max(0, this.size.y - toolbarH),
      contentSize: () => this.contentH,
      value: () => this.scroll.peek(),
      onChange: (next) => this.scroll.set(next),
    })

    this.btnRefresh.z = 10
    this.btnUpload.z = 10
    this.btnDownload.z = 10
    this.btnDelete.z = 10
    this.btnEdit.z = 10
    this.btnPrefix.z = 10
    this.scrollbar.z = 40

    this.root.add(this.btnRefresh)
    this.root.add(this.btnUpload)
    this.root.add(this.btnDownload)
    this.root.add(this.btnDelete)
    this.root.add(this.btnEdit)
    this.root.add(this.btnPrefix)
    this.root.add(this.scrollbar)
  }

  private async ensureFs() {
    if (!this.fsPromise) this.fsPromise = openOpfs()
    return await this.fsPromise
  }

  private async refresh() {
    const seq = ++this.opSeq
    this.busy = true
    this.error = null
    invalidateAll()
    try {
      const fs = await this.ensureFs()
      const entries = await fs.list(this.prefix ?? undefined)
      const usage = await fs.getUsage()
      if (seq !== this.opSeq) return
      this.entries = entries.sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
      this.usage = usage
      if (this.selectedPath && !this.entries.some((e) => e.path === this.selectedPath)) this.selectedPath = null
    } catch (e) {
      if (seq !== this.opSeq) return
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq !== this.opSeq) return
      this.busy = false
      invalidateAll()
    }
  }

  private listRect() {
    const toolbarH = 28
    return { x: 2, y: toolbarH + 2, w: Math.max(0, this.size.x - 14), h: Math.max(0, this.size.y - toolbarH - 4) }
  }

  private maxScroll() {
    const rowH = 22
    const pad = 4
    const view = this.listRect().h
    this.contentH = Math.max(0, this.entries.length * rowH + pad)
    return Math.max(0, this.contentH - view)
  }

  private async upload() {
    const input = ensureHiddenFileInput()
    input.value = ""
    input.onchange = async () => {
      const files = input.files ? [...input.files] : []
      if (!files.length) return
      const prefix = (this.prefix ?? "uploads").trim() || "uploads"
      const seq = ++this.opSeq
      this.busy = true
      invalidateAll()
      try {
        const fs = await this.ensureFs()
        for (const f of files) {
          const dst = `${prefix}/${f.name}`
          await fs.writeFile(dst, f, { type: f.type || "application/octet-stream" })
        }
        if (seq !== this.opSeq) return
        await this.refresh()
      } catch (e) {
        if (seq !== this.opSeq) return
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        if (seq !== this.opSeq) return
        this.busy = false
        invalidateAll()
      }
    }
    input.click()
  }

  private async downloadSelected() {
    const path = this.selectedPath
    if (!path) return
    const seq = ++this.opSeq
    this.busy = true
    invalidateAll()
    try {
      const fs = await this.ensureFs()
      const blob = await fs.readFile(path)
      if (seq !== this.opSeq) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = path.split("/").pop() ?? "download"
      a.style.display = "none"
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      if (seq !== this.opSeq) return
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq !== this.opSeq) return
      this.busy = false
      invalidateAll()
    }
  }

  private async deleteSelected() {
    const path = this.selectedPath
    if (!path) return
    if (!confirm(`Delete ${path}?`)) return
    const seq = ++this.opSeq
    this.busy = true
    invalidateAll()
    try {
      const fs = await this.ensureFs()
      await fs.delete(path)
      if (seq !== this.opSeq) return
      this.selectedPath = null
      await this.refresh()
    } catch (e) {
      if (seq !== this.opSeq) return
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq !== this.opSeq) return
      this.busy = false
      invalidateAll()
    }
  }

  private async editSelectedMeta() {
    const path = this.selectedPath
    if (!path) return
    const cur = this.entries.find((e) => e.path === path)
    const type = prompt("type (mime)", cur?.type ?? "application/octet-stream")
    if (type === null) return
    const extrasText = prompt("extras (JSON)", JSON.stringify(cur?.extras ?? {}, null, 2))
    if (extrasText === null) return
    let extras: Record<string, unknown> | undefined
    try {
      const v = JSON.parse(extrasText)
      if (v && typeof v === "object" && !Array.isArray(v)) extras = v
      else extras = { value: v }
    } catch (e) {
      alert("Invalid JSON")
      return
    }

    const seq = ++this.opSeq
    this.busy = true
    invalidateAll()
    try {
      const fs = await this.ensureFs()
      await fs.updateMeta(path, { type: type.trim() || cur?.type, extras })
      if (seq !== this.opSeq) return
      await this.refresh()
    } catch (e) {
      if (seq !== this.opSeq) return
      this.error = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq !== this.opSeq) return
      this.busy = false
      invalidateAll()
    }
  }

  private setPrefix() {
    const next = prompt("prefix (optional)", this.prefix ?? "")
    if (next === null) return
    const v = next.trim()
    this.prefix = v ? v : null
    this.scroll.set(0)
    void this.refresh()
  }

  hitTest(pSurface: Vec2) {
    return this.root.hitTest(pSurface)
  }

  onWheel(e: WheelUIEvent, _viewport: ViewportContext) {
    const list = this.listRect()
    if (e.y < list.y || e.y > list.y + list.h) return
    const maxY = this.maxScroll()
    const next = clamp(this.scroll.peek() + e.deltaY, 0, maxY)
    if (next === this.scroll.peek()) return
    this.scroll.set(next)
    e.handle()
  }

  render(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, viewport: ViewportContext) {
    this.size = { x: viewport.contentRect.w, y: viewport.contentRect.h }
    const c = ctx as any as CanvasRenderingContext2D

    draw(c, RRect({ x: 0, y: 0, w: this.size.x, h: this.size.y, r: theme.radii.sm }, { fill: { color: "rgba(255,255,255,0.01)" } }))
    draw(c, RectOp({ x: 0, y: 0, w: this.size.x, h: 28 }, { fill: { color: "rgba(255,255,255,0.015)" } }))

    if (this.entries.length === 0 && !this.busy && !this.error) {
      void this.refresh()
    }

    const list = this.listRect()
    const rowH = 22
    const topPad = list.y
    const y0 = this.scroll.peek()
    const maxY = this.maxScroll()
    this.scroll.set((v) => clamp(v, 0, maxY))

    const visible = Math.ceil(list.h / rowH) + 2
    while (this.rowWidgets.length < visible) {
      const r = new Row()
      r.z = 1
      this.rowWidgets.push(r)
      this.root.add(r)
    }

    const first = Math.max(0, Math.floor((y0 - 2) / rowH))
    const last = Math.min(this.entries.length - 1, first + visible)

    for (let i = 0; i < this.rowWidgets.length; i++) {
      const idx = first + i
      const w = this.rowWidgets[i]
      const e = this.entries[idx]
      if (!e || idx > last) {
        w.set({ rect: { x: 0, y: 0, w: 0, h: 0 }, leftText: "" })
        continue
      }
      const y = topPad + idx * rowH - y0
      const right = `${formatBytes(e.size)} · ${e.type}`
      w.set(
        {
          rect: { x: list.x, y, w: list.w, h: rowH },
          leftText: e.path,
          rightText: right,
          variant: "item",
          selected: e.path === this.selectedPath,
        },
        () => {
          this.selectedPath = e.path
          invalidateAll()
        },
      )
    }

    const usageTextParts: string[] = []
    usageTextParts.push(`${this.usage.entries} files`)
    usageTextParts.push(formatBytes(this.usage.bytes))
    if (typeof this.usage.usage === "number" && typeof this.usage.quota === "number" && this.usage.quota > 0) {
      const pct = Math.min(100, Math.max(0, (this.usage.usage / this.usage.quota) * 100))
      usageTextParts.push(`${formatBytes(this.usage.usage)} / ${formatBytes(this.usage.quota)} (${pct.toFixed(1)}%)`)
    }
    const usageText = usageTextParts.join(" · ")

    draw(
      c,
      Text({
        x: Math.max(6, this.size.x - 6),
        y: 28 / 2 + 0.5,
        text: this.busy ? "Working…" : this.error ? this.error : usageText,
        style: { color: this.error ? "rgba(255,120,120,0.95)" : theme.colors.textMuted, font: `${400} ${Math.max(10, theme.typography.body.size - 2)}px ${theme.typography.family}`, baseline: "middle", align: "end" },
      }),
    )

    this.root.draw(c)
  }
}

