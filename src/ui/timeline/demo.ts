import type { TimelineViewModel } from "./model"
import { clipPalette } from "@tnl/canvas-interface/theme"

export function createTimelineDemoModel(): TimelineViewModel {
  return {
    rangeStart: 0,
    rangeEnd: 720,
    baseUnit: 1,
    tracks: [
      {
        id: "video-a",
        name: "Video A",
        kind: "video",
        height: 50,
        items: [
          { id: "va-1", start: 8, duration: 120, label: "Opening Wide", color: clipPalette[0] },
          { id: "va-2", start: 144, duration: 96, label: "Interview - Camera A", color: clipPalette[1] },
          { id: "va-3", start: 276, duration: 140, label: "B-Roll Downtown Walkthrough", color: clipPalette[2] },
          { id: "va-4", start: 452, duration: 110, label: "Studio Pickup", color: clipPalette[3] },
        ],
      },
      {
        id: "video-b",
        name: "Video B",
        kind: "video",
        height: 50,
        items: [
          { id: "vb-1", start: 32, duration: 76, label: "Insert Closeup", color: clipPalette[4] },
          { id: "vb-2", start: 180, duration: 84, label: "Reaction Shot", color: clipPalette[5] },
          { id: "vb-3", start: 312, duration: 72, label: "Cutaway", color: clipPalette[6] },
          { id: "vb-4", start: 510, duration: 120, label: "Street Detail Montage", color: clipPalette[7] },
        ],
      },
      {
        id: "audio-dialogue",
        name: "Dialogue",
        kind: "audio",
        height: 50,
        items: [
          { id: "ad-1", start: 0, duration: 210, label: "INTV_A_01", color: clipPalette[8] },
          { id: "ad-2", start: 230, duration: 160, label: "INTV_A_02", color: clipPalette[9] },
          { id: "ad-3", start: 416, duration: 180, label: "INTV_A_03", color: clipPalette[10] },
        ],
      },
      {
        id: "audio-ambience",
        name: "Ambience",
        kind: "audio",
        height: 50,
        items: [
          { id: "aa-1", start: 0, duration: 720, label: "CITY_ROOMTONE_LOOP", color: clipPalette[11] },
        ],
      },
      {
        id: "captions",
        name: "Captions",
        kind: "generic",
        height: 50,
        items: [
          { id: "cc-1", start: 20, duration: 60, label: "Intro lower-third", color: clipPalette[12] },
          { id: "cc-2", start: 168, duration: 90, label: "Speaker name / role", color: clipPalette[13] },
          { id: "cc-3", start: 380, duration: 140, label: "Location / date / additional context", color: clipPalette[14] },
        ],
      },
      {
        id: "markers",
        name: "Markers",
        kind: "generic",
        height: 50,
        items: [
          { id: "mk-1", start: 48, duration: 18, label: "Beat", color: clipPalette[15] },
          { id: "mk-2", start: 192, duration: 18, label: "Question", color: clipPalette[16] },
          { id: "mk-3", start: 438, duration: 18, label: "Cut", color: clipPalette[17] },
          { id: "mk-4", start: 640, duration: 18, label: "Outro", color: clipPalette[18] },
        ],
      },
      {
        id: "notes",
        name: "Notes",
        kind: "generic",
        height: 50,
        items: [
          { id: "nt-1", start: 88, duration: 94, label: "TODO: replace with cleaner take after client review", color: clipPalette[19] },
          { id: "nt-2", start: 534, duration: 112, label: "Music swell starts here", color: clipPalette[20] },
        ],
      },
    ],
  }
}
