import { createElement, Fragment } from "../../../jsx"
import { Button, Column, PanelActionRow, PanelColumn, PanelHeader, PanelScroll, PanelSection, RowItem, Text } from "../../../builder/components"
import { defineSurface, mountSurface } from "../../../builder/surface_builder"
import type { CodecRuntimeEntry } from "../../../../core/codecs"
import { getWebNavigatorInfo, getWebRuntimeFlags } from "../../../../platform/web/navigator"
import { probeCodecConfig } from "../../../../platform/web/webcodecs"
import type { DeveloperContext, DeveloperPanelSpec } from "../index"

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

function runtimeInstanceRows(instances: CodecRuntimeEntry[]) {
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

function invalidateAll() {
  ;(globalThis as any).__TNL_DEVTOOLS__?.invalidate?.()
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
    id: "Developer.Codec",
    title: "Codec",
    build: (ctx) => mountSurface(CodecPanelSurface, { ctx }),
  }
}

const CodecPanelSurface = defineSurface({
  id: "Developer.Codec.Surface",
  setup: (_props: { ctx: DeveloperContext }) => {
    let initialized = false
    let running = false
    let lastUpdated = ""
    let error: string | null = null
    let results: CodecProbeResult[] = []

    const refresh = async () => {
      if (running) return
      running = true
      error = null
      invalidateAll()
      try {
        results = await collectCodecProbeResults()
        lastUpdated = new Date().toLocaleTimeString()
      } catch (nextError) {
        error = nextError instanceof Error ? nextError.message : String(nextError)
      } finally {
        running = false
        invalidateAll()
      }
    }

    return ({ ctx }: { ctx: DeveloperContext }) => {
      if (!initialized) {
        initialized = true
        void refresh()
      }

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
          <PanelHeader title="WebCodecs" meta={summary}>
            <Text tone="muted" size="meta">{running ? "Running" : "Runtime Probe"}</Text>
          </PanelHeader>
          <PanelActionRow
            key="codec.actions"
            compact
            actions={[
              { key: "refresh", icon: "R", text: "Refresh", title: "Refresh Codec Probe", onClick: () => void refresh(), disabled: running },
            ]}
          />
          <PanelScroll key="codec.scroll">
            <Column style={{ axis: "column", padding: 6, gap: 10, w: "auto", h: "auto" }}>
              <PanelSection key="codec.platform" title="Platform">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {navigatorInfoRows().map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.right} />
                  ))}
                </Column>
              </PanelSection>

              <PanelSection key="codec.runtime" title="Runtime APIs">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {runtimeCapabilityRows().map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.right} />
                  ))}
                </Column>
              </PanelSection>

              <PanelSection key="codec.instances" title="Active Instances">
                {activeInstances.length > 0 ? (
                  <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                    {runtimeInstanceRows(activeInstances).map((row) => (
                      <RowItem key={row.id} leftText={row.left} rightText={row.right} />
                    ))}
                  </Column>
                ) : (
                  <Text tone="muted">No active decoder or encoder instances have registered with the runtime yet.</Text>
                )}
              </PanelSection>

              <PanelSection key="codec.video.decode" title="Video Decode Probe">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {videoDecoderRows.map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </Column>
              </PanelSection>

              <PanelSection key="codec.video.encode" title="Video Encode Probe">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {videoEncoderRows.map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </Column>
              </PanelSection>

              <PanelSection key="codec.audio.decode" title="Audio Decode Probe">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {audioDecoderRows.map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </Column>
              </PanelSection>

              <PanelSection key="codec.audio.encode" title="Audio Encode Probe">
                <Column style={{ axis: "column", gap: 0, w: "auto", h: "auto" }}>
                  {audioEncoderRows.map((row) => (
                    <RowItem key={row.id} leftText={row.label} rightText={row.detail} />
                  ))}
                </Column>
              </PanelSection>

              {extraInfo !== undefined ? (
                <PanelSection key="codec.extra" title="Runtime Hook">
                  <Text tone="muted">{JSON.stringify(extraInfo, null, 2)}</Text>
                </PanelSection>
              ) : null}

              {error ? (
                <PanelSection key="codec.error" title="Probe Error">
                  <Text color="rgba(255,120,120,0.95)">{error}</Text>
                </PanelSection>
              ) : null}

              <PanelSection key="codec.notes" title="Notes">
                <Text tone="muted">
                  Probe results come from the browser's runtime `isConfigSupported(...)` checks for a small set of representative codecs. They are capability hints, not a complete media compatibility matrix.
                </Text>
              </PanelSection>
            </Column>
          </PanelScroll>
        </PanelColumn>
      )
    }
  },
})
