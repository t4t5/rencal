export type Tone = "muted" | "accent" | "success" | "bold"
export type Segment = string | [string, Tone]

export type TerminalLine =
  | { input: string }
  /** `delay`: ms before the line appears, e.g. while an agent thinks. */
  | { output: Segment[]; delay?: number }
