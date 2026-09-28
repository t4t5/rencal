// The data behind "Your calendar is a folder": the caldir directory in the
// file browser, and the agent session that reads it.
import type { TerminalLine } from "./terminal"

export interface CaldirFolder {
  name: string
  color: string
  files: string[]
}

/** The caldir directory, one folder per calendar and one .ics file per event. */
export const CALDIR: CaldirFolder[] = [
  {
    name: "google-work",
    color: "#2885e0",
    files: [
      "2026-06-23T1030__design-handoff-review.ics",
      "2026-06-25T1100__backend-api-planning.ics",
      "2026-06-26T0930__product-stand-up.ics",
    ],
  },
  {
    name: "icloud-personal",
    color: "#f77b52",
    files: [
      "2023-08-12T0710__flight-to-lisbon.ics",
      "2023-08-22T1805__flight-to-london.ics",
      "2024-03-08T1120__flight-to-tokyo.ics",
      "2024-03-24T0945__flight-to-london.ics",
      "2025-05-02T0830__flight-to-new-york.ics",
      "2025-05-11T2200__flight-to-london.ics",
      "2025-10-03T0655__flight-to-porto.ics",
      "2025-10-11T1740__flight-to-london.ics",
      "2026-06-26T1900__grocery-delivery.ics",
      "2026-06-28T1030__sunday-walk-and-coffee.ics",
    ],
  },
]

/** What the agent greps for; the file browser selects the matching files. */
export const AGENT_GREP = "flight"

const matches = CALDIR.flatMap((folder) => folder.files).filter((file) => file.includes(AGENT_GREP))
const SHOWN_MATCHES = 3

const THINK_MS = 900
const stay = (country: string, days: number): TerminalLine => ({
  output: ["  ", country.padEnd(16), [`${days} days`.padStart(7), "bold"]],
})

/** A coding agent answering a calendar question by grepping the caldir directory. */
export const AGENT_SESSION: TerminalLine[] = [
  { input: "How many days did I spend abroad in the last 3 years?" },
  { output: [] },
  {
    output: [["● ", "success"], ["Bash", "bold"], `(ls ~/caldir/*/ | grep ${AGENT_GREP})`],
    delay: THINK_MS,
  },
  {
    output: [["  ⎿  ", "muted"], matches[0]],
    delay: 400,
    select: AGENT_GREP,
  },
  ...matches.slice(1, SHOWN_MATCHES).map((file): TerminalLine => ({ output: [`     ${file}`] })),
  {
    output: [[`     … +${matches.length - SHOWN_MATCHES} lines (ctrl+o to expand)`, "muted"]],
  },
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
