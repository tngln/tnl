import type { TimelineViewModel } from "./model"

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
          { id: "va-1", start: 8, duration: 120, label: "Opening Wide", color: "#4f8cff" },
          { id: "va-2", start: 144, duration: 96, label: "Interview - Camera A", color: "#61b8ff" },
          { id: "va-3", start: 276, duration: 140, label: "B-Roll Downtown Walkthrough", color: "#3f78ff" },
          { id: "va-4", start: 452, duration: 110, label: "Studio Pickup", color: "#568dff" },
        ],
      },
      {
        id: "video-b",
        name: "Video B",
        kind: "video",
        height: 50,
        items: [
          { id: "vb-1", start: 32, duration: 76, label: "Insert Closeup", color: "#f0a23b" },
          { id: "vb-2", start: 180, duration: 84, label: "Reaction Shot", color: "#ffb74f" },
          { id: "vb-3", start: 312, duration: 72, label: "Cutaway", color: "#d9922d" },
          { id: "vb-4", start: 510, duration: 120, label: "Street Detail Montage", color: "#e8a13e" },
        ],
      },
      {
        id: "audio-dialogue",
        name: "Dialogue",
        kind: "audio",
        height: 50,
        items: [
          { id: "ad-1", start: 0, duration: 210, label: "INTV_A_01", color: "#3dc28a" },
          { id: "ad-2", start: 230, duration: 160, label: "INTV_A_02", color: "#46d198" },
          { id: "ad-3", start: 416, duration: 180, label: "INTV_A_03", color: "#34a877" },
        ],
      },
      {
        id: "audio-ambience",
        name: "Ambience",
        kind: "audio",
        height: 50,
        items: [
          { id: "aa-1", start: 0, duration: 720, label: "CITY_ROOMTONE_LOOP", color: "#6d8f5b" },
        ],
      },
      {
        id: "captions",
        name: "Captions",
        kind: "generic",
        height: 50,
        items: [
          { id: "cc-1", start: 20, duration: 60, label: "Intro lower-third", color: "#b876d9" },
          { id: "cc-2", start: 168, duration: 90, label: "Speaker name / role", color: "#c98af0" },
          { id: "cc-3", start: 380, duration: 140, label: "Location / date / additional context", color: "#aa68cb" },
        ],
      },
      {
        id: "markers",
        name: "Markers",
        kind: "generic",
        height: 50,
        items: [
          { id: "mk-1", start: 48, duration: 18, label: "Beat", color: "#d65b7a" },
          { id: "mk-2", start: 192, duration: 18, label: "Question", color: "#ef6d8f" },
          { id: "mk-3", start: 438, duration: 18, label: "Cut", color: "#c84f6c" },
          { id: "mk-4", start: 640, duration: 18, label: "Outro", color: "#e36b89" },
        ],
      },
      {
        id: "notes",
        name: "Notes",
        kind: "generic",
        height: 50,
        items: [
          { id: "nt-1", start: 88, duration: 94, label: "TODO: replace with cleaner take after client review", color: "#78839b" },
          { id: "nt-2", start: 534, duration: 112, label: "Music swell starts here", color: "#6d768c" },
        ],
      },
    ],
  }
}
