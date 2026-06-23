const DEBUG_ALL_VALUES = new Set(["1", "true", "*"])

export function isDebugMode(namespace: string): boolean {
  const debug = import.meta.env.VITE_RENCAL_DEBUG
  if (!debug) return false

  const enabledNamespaces = debug
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  return enabledNamespaces.some(
    (value) => DEBUG_ALL_VALUES.has(value.toLowerCase()) || value === namespace,
  )
}
