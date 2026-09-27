// The terminal sessions in the "Your calendar is a folder" split terminal.
import type { TerminalLine } from "./terminal"

const ics = (line: string): TerminalLine => {
  const split = line.search(/[:;]/)
  return { output: [[line.slice(0, split), "muted"], line.slice(split)] }
}

/** The caldir directory behind the demo calendar, and one of its events. */
export const FILES_SESSION: TerminalLine[] = [
  { input: "cd ~/caldir && tree" },
  { output: ["."] },
  { output: ["├── ", ["google-work", "accent"]] },
  { output: ["│   ├── 2026-06-25T1100__backend-api-planning.ics"] },
  { output: ["│   └── 2026-06-26T0930__product-stand-up.ics"] },
  { output: ["└── ", ["icloud-personal", "accent"]] },
  { output: ["    ├── 2026-06-26T1900__grocery-delivery.ics"] },
  { output: ["    └── 2026-06-28T1030__sunday-walk-and-coffee.ics"] },
  { output: [] },
  { output: ["2 directories, 4 files"] },
  { input: "cat google-work/2026-06-25T1100__backend-api-planning.ics" },
  ...[
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:CALDIR",
    "BEGIN:VEVENT",
    "DTSTART;TZID=Europe/London:20260625T110000",
    "DTEND;TZID=Europe/London:20260625T120000",
    "LOCATION:Meeting Room 2",
    "SUMMARY:Backend API planning",
    "UID:4f1c9a2e-7b3d-4c8a-9e61-2d5f0b7a3c18@caldir",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(ics),
]

const THINK_MS = 900
const stay = (country: string, days: number): TerminalLine => ({
  output: ["  ", country.padEnd(16), [`${days} days`.padStart(7), "bold"]],
})

/** A coding agent answering a calendar question by grepping the caldir directory. */
export const AGENT_SESSION: TerminalLine[] = [
  { input: "How many days did I spend abroad in the last 3 years?" },
  { output: [] },
  {
    output: [["● ", "success"], ["Bash", "bold"], "(ls ~/caldir/*/ | grep flight)"],
    delay: THINK_MS,
  },
  { output: [["  ⎿  ", "muted"], "2023-08-12T0710__flight-to-lisbon.ics"], delay: 400 },
  { output: ["     2023-08-26T1805__flight-to-london.ics"] },
  { output: ["     2024-03-08T1120__flight-to-tokyo.ics"] },
  { output: [["     … +5 lines (ctrl+o to expand)", "muted"]] },
  { output: [] },
  {
    output: [["● ", "muted"], "You spent ", ["43 days", "bold"], " abroad across 4 trips:"],
    delay: THINK_MS,
  },
  { output: [] },
  stay("Portugal", 18),
  stay("Japan", 16),
  stay("United States", 9),
]
