export type Tone = "muted" | "success" | "bold"
export type Segment = string | [string, Tone]

export type TerminalLine =
  | { input: string }
  /**
   * `delay`: ms before the line appears, e.g. while an agent thinks.
   * `select`: selects the `[data-file]`s whose name contains it, as the line appears.
   */
  | { output: Segment[]; delay?: number; select?: string }
