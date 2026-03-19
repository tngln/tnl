import { createElement, Fragment } from "@tnl/canvas-interface/jsx"
import { Button, ListRow, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, PanelSection, Text, VStack, defineSurface, mountSurface } from "@tnl/canvas-interface/builder"
import { getDebugLevel } from "@tnl/canvas-interface/ui"
import { theme } from "@tnl/canvas-interface/theme"
import { getWebNavigatorInfo, getWebRuntimeFlags } from "@tnl/canvas-interface/browser"
import { probeCodecConfig } from "@tnl/app/platform"
import { invalidateAll } from "@tnl/canvas-interface/ui"
import type { DeveloperCodecEntry, DeveloperContext, DeveloperPanelSpec } from "@tnl/canvas-interface/developer"
import { createAsyncJobState } from "@/ui/async_state"

type ProbeRow = {
  id: string
  label: string
  right: string
}

type CodecProbeResult = {
  id: string
  label: string
  kind: "video-decoder" | "video-encoder" | "audio-decoder" | "audio-encoder"
  codec: string
  supported: boolean
  detail: string
}

function runtimeInstanceRows(instances: DeveloperCodecEntry[]) {
  return instances.map((entry) => {
    const parts = [entry.codec, entry.status]
    if (entry.queueSize !== undefined) parts.push(`q${entry.queueSize}`)
    if (entry.hardwareAcceleration) parts.push(entry.hardwareAcceleration)
    if (entry.detail) parts.push(entry.detail)
    return {
      id: entry.id,
      left: `${entry.label} (${entry.kind})`,
      right: parts.join(" · "),
    }
  })
}


function boolText(value: boolean) {
  return value ? "Yes" : "No"
}

function yesNoRow(id: string, label: string, value: boolean): ProbeRow {
  return { id, label, right: boolText(value) }
}

function valueRow(id: string, label: string, value: unknown): ProbeRow {
  return { id, label, right: value === undefined || value === null || value === "" ? "-" : String(value) }
}

function navigatorInfoRows() {
  const info = getWebNavigatorInfo()
  return [
    valueRow("browser.ua", "User Agent", info.userAgent),
    valueRow("browser.platform", "Platform", info.platform),
    valueRow("browser.brands", "Brands", info.brands),
    valueRow("browser.lang", "Language", info.language),
    valueRow("browser.languages", "Languages", info.languages.join(", ")),
    valueRow("browser.mobile", "Mobile", info.mobile === null ? "-" : boolText(info.mobile)),
    valueRow("browser.online", "Online", boolText(info.online)),
    valueRow("browser.memory", "Device Memory", info.deviceMemory ? `${info.deviceMemory} GB` : "-"),
    valueRow("browser.threads", "Hardware Concurrency", info.hardwareConcurrency || "-"),
    valueRow("browser.touch", "Max Touch Points", info.maxTouchPoints ?? "-"),
  ]
}

function runtimeCapabilityRows() {
  const flags = getWebRuntimeFlags()
  return [
    yesNoRow("runtime.secure", "Secure Context", flags.secureContext),
    yesNoRow("runtime.coi", "Cross-Origin Isolated", flags.crossOriginIsolated),
    yesNoRow("runtime.sab", "SharedArrayBuffer", flags.sharedArrayBuffer),
    yesNoRow("runtime.worker", "Worker", flags.worker),
    yesNoRow("runtime.offscreen", "OffscreenCanvas", flags.offscreenCanvas),
    yesNoRow("runtime.mcap", "MediaCapabilities", flags.mediaCapabilities),
    yesNoRow("runtime.videoFrame", "VideoFrame", flags.videoFrame),
    yesNoRow("runtime.encodedVideoChunk", "EncodedVideoChunk", flags.encodedVideoChunk),
    yesNoRow("runtime.encodedAudioChunk", "EncodedAudioChunk", flags.encodedAudioChunk),
    yesNoRow("runtime.vdec", "VideoDecoder", flags.videoDecoder),
    yesNoRow("runtime.venc", "VideoEncoder", flags.videoEncoder),
    yesNoRow("runtime.adec", "AudioDecoder", flags.audioDecoder),
    yesNoRow("runtime.aenc", "AudioEncoder", flags.audioEncoder),
  ]
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "-"
  const total = Math.floor(ms / 1000)
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600) % 24
  const d = Math.floor(total / 86400)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

function sessionInfoRows(startedAtMs: number) {
  const now = Date.now()
  const startedAt = new Date(startedAtMs)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  const offsetMin = -new Date().getTimezoneOffset()
  const offsetSign = offsetMin >= 0 ? "+" : "-"
  const offsetAbs = Math.abs(offsetMin)
  const offset = `${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, "0")}:${String(offsetAbs % 60).padStart(2, "0")}`
  return [
    valueRow("session.now", "Now", new Date(now).toLocaleString()),
    valueRow("session.started", "Started", startedAt.toLocaleString()),
    valueRow("session.uptime", "Uptime", formatDuration(now - startedAtMs)),
    valueRow("session.tz", "Time Zone", timezone || "-"),
    valueRow("session.offset", "UTC Offset", offset),
    valueRow("session.locale", "Locale", locale || "-"),
    valueRow("session.debug", "Debug Level", getDebugLevel()),
  ]
}

function developerContextRows(ctx: DeveloperContext) {
  const parts: ProbeRow[] = []
  const signals = ctx.reactivity?.list?.()
  if (Array.isArray(signals)) parts.push(valueRow("ctx.signals", "Signals", signals.length))
  const workers = ctx.workers?.list?.()
  if (Array.isArray(workers)) parts.push(valueRow("ctx.workers", "Workers", workers.length))
  const codecs = ctx.codecs?.list?.()
  if (Array.isArray(codecs)) parts.push(valueRow("ctx.codecs", "Codec Instances", codecs.length))
  const layers = ctx.surface?.listLayers?.()
  if (Array.isArray(layers)) parts.push(valueRow("ctx.layers", "Surface Layers", layers.length))
  const blits = ctx.surface?.listBlits?.()
  if (Array.isArray(blits)) parts.push(valueRow("ctx.blits", "Surface Blits", blits.length))
  return parts
}

async function probeCodec(
  kind: CodecProbeResult["kind"],
  label: string,
  codec: string,
  config: Record<string, unknown>,
): Promise<CodecProbeResult> {
  const support = await probeCodecConfig(kind, config)
  if (!support.available) {
    return { id: `${kind}.${codec}`, kind, label, codec, supported: false, detail: "API unavailable" }
  }
  const suffix = support.hardwareAcceleration ? ` (${support.hardwareAcceleration})` : ""
  return {
    id: `${kind}.${codec}`,
    kind,
    label,
    codec,
    supported: support.supported,
    detail: support.detail === "Supported" || support.detail === "Unsupported" ? `${support.detail}${suffix}` : support.detail,
  }
}

async function collectCodecProbeResults() {
  return await Promise.all([
    probeCodec("video-decoder", "H.264 Decoder", "avc1.42001E", { codec: "avc1.42001E", codedWidth: 1920, codedHeight: 1080 }),
    probeCodec("video-decoder", "VP9 Decoder", "vp09.00.10.08", { codec: "vp09.00.10.08", codedWidth: 1920, codedHeight: 1080 }),
    probeCodec("video-decoder", "AV1 Decoder", "av01.0.04M.08", { codec: "av01.0.04M.08", codedWidth: 1920, codedHeight: 1080 }),
    probeCodec("video-encoder", "H.264 Encoder", "avc1.42001E", { codec: "avc1.42001E", width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 }),
    probeCodec("video-encoder", "VP9 Encoder", "vp09.00.10.08", { codec: "vp09.00.10.08", width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 }),
    probeCodec("video-encoder", "AV1 Encoder", "av01.0.04M.08", { codec: "av01.0.04M.08", width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 }),
    probeCodec("audio-decoder", "AAC Decoder", "mp4a.40.2", { codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: 48_000 }),
    probeCodec("audio-decoder", "Opus Decoder", "opus", { codec: "opus", numberOfChannels: 2, sampleRate: 48_000 }),
    probeCodec("audio-encoder", "AAC Encoder", "mp4a.40.2", { codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: 48_000, bitrate: 128_000 }),
    probeCodec("audio-encoder", "Opus Encoder", "opus", { codec: "opus", numberOfChannels: 2, sampleRate: 48_000, bitrate: 128_000 }),
  ])
}

export function createCodecPanel(): DeveloperPanelSpec {
  return {
    id: "Developer.Codecs",
    title: "Info",
    build: (ctx) => mountSurface(CodecPanelSurface, { ctx }),
  }
}

const CodecPanelSurface = defineSurface({
  id: "Developer.Codecs.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    const startedAtMs = Date.now()
    let initialized = false
    let lastUpdated = ""
    let results: CodecProbeResult[] = []
    const asyncState = createAsyncJobState({ invalidate: invalidateAll })

    const refresh = async () => {
      if (asyncState.busy()) return
      await asyncState.run(async () => {
        results = await collectCodecProbeResults()
        lastUpdated = new Date().toLocaleTimeString()
      })
    }

    return ({ ctx }: { ctx: DeveloperContext }) => {
      if (!initialized) {
        initialized = true
        void refresh()
      }

      const running = asyncState.busy()
      const error = asyncState.error()
      const extraInfo = ctx.codecs?.info?.()
      const activeInstances = ctx.codecs?.list?.() ?? []
      const summary = running
        ? "Probing codec support..."
        : error
          ? error
          : lastUpdated
            ? `Last probe ${lastUpdated}`
            : "Runtime probe pending"

      const videoDecoderRows = results.filter((entry) => entry.kind === "video-decoder")
      const videoEncoderRows = results.filter((entry) => entry.kind === "video-encoder")
      const audioDecoderRows = results.filter((entry) => entry.kind === "audio-decoder")
      const audioEncoderRows = results.filter((entry) => entry.kind === "audio-encoder")

      return (
        <PanelColumn>
          <PanelHeader title="Info" meta={summary}>
            <Text tone="muted" size="meta">Developer Runtime</Text>
          </PanelHeader>
          <PanelActionRow
            key="codec.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: "Refresh", title: "Refresh Codec Probe", onClick: () => void refresh(), disabled: running },
            ]}
          />
          <PanelScroll key="codec.scroll">
            <VStack style={{ padding: 6, gap: 10 }}>
              <PanelSection key="info.session" title="Session">
                <VStack>
                  {sessionInfoRows(startedAtMs).map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.right} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="info.context" title="Developer Context">
                {developerContextRows(ctx).length ? (
                  <VStack>
                    {developerContextRows(ctx).map((row) => (
                      <ListRow key={row.id} leftText={row.label} rightText={row.right} />
                    ))}
                  </VStack>
                ) : (
                  <Text tone="muted">No runtime context hooks are available.</Text>
                )}
              </PanelSection>

              <PanelSection key="codec.platform" title="Platform">
                <VStack>
                  {navigatorInfoRows().map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.right} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="codec.runtime" title="Runtime APIs">
                <VStack>
                  {runtimeCapabilityRows().map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.right} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="codec.instances" title="Active Instances">
                {activeInstances.length > 0 ? (
                  <VStack>
                    {runtimeInstanceRows(activeInstances).map((row) => (
                      <ListRow key={row.id} leftText={row.left} rightText={row.right} />
                    ))}
                  </VStack>
                ) : (
                  <Text tone="muted">No active decoder or encoder instances have registered with the runtime yet.</Text>
                )}
              </PanelSection>

              <PanelSection key="codec.video.decode" title="Video Decode Probe">
                <VStack>
                  {videoDecoderRows.map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="codec.video.encode" title="Video Encode Probe">
                <VStack>
                  {videoEncoderRows.map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="codec.audio.decode" title="Audio Decode Probe">
                <VStack>
                  {audioDecoderRows.map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </VStack>
              </PanelSection>

              <PanelSection key="codec.audio.encode" title="Audio Encode Probe">
                <VStack>
                  {audioEncoderRows.map((row) => (
                    <ListRow key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </VStack>
              </PanelSection>

              {extraInfo !== undefined ? (
                <PanelSection key="codec.extra" title="Runtime Hook">
                  <Text tone="muted">{JSON.stringify(extraInfo, null, 2)}</Text>
                </PanelSection>
              ) : null}

              {error ? (
                <PanelSection key="codec.error" title="Probe Error">
                  <Text color={theme.colors.danger}>{error}</Text>
                </PanelSection>
              ) : null}

              <PanelSection key="codec.notes" title="Notes">
                <Text tone="muted">
                  Probe results come from the browser's runtime `isConfigSupported(...)` checks for a small set of representative codecs. They are capability hints, not a complete media compatibility matrix.
                </Text>
              </PanelSection>
            </VStack>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
