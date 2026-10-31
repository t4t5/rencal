import { rpc } from "@/rpc"
import type { KeyBinding as UserKeyBinding, KeysSnapshot } from "@/rpc/bindings"

export type { KeysSnapshot, UserKeyBinding }

/** Bindings from `~/.config/rencal/keys.toml`; `keys-changed` reports later edits. */
export function getKeys(): Promise<KeysSnapshot> {
  return rpc.keys.get()
}

export const keys = {
  get: getKeys,
} as const
