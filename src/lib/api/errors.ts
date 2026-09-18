import type { RpcError, RpcErrorKind } from "@/rpc/bindings"

const errorKinds = {
  calendar_not_found: true,
  event_not_found: true,
  provider_not_found: true,
  provider_failure: true,
  invalid_input: true,
  conflict: true,
  configuration: true,
  authentication: true,
  io: true,
  internal: true,
} satisfies Record<RpcErrorKind, true>

export type RenCalError = RpcError

export function isRenCalError(error: unknown): error is RenCalError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof error.kind === "string" &&
    Object.hasOwn(errorKinds, error.kind) &&
    "message" in error &&
    typeof error.message === "string"
  )
}

export function getErrorMessage(error: unknown, fallback: string): string {
  const message =
    isRenCalError(error) || error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : undefined
  return message?.trim() ? message : fallback
}
