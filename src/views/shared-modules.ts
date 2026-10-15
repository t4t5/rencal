// Modules renCal shares with plugin scripts. `just plugin-api` publishes this
// list so plugin builds can mark them external; keep the file import-free.
export const SHARED_MODULE_IDS = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "@js-temporal/polyfill",
  "@rencal/plugin-api",
] as const

export type SharedModuleId = (typeof SHARED_MODULE_IDS)[number]
