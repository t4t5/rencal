import { rpc } from "@/rpc"
import type { KeyBinding as UserKeyBinding, KeyEdit, KeysSnapshot } from "@/rpc/bindings"

export type { KeyEdit, KeysSnapshot, UserKeyBinding }

/** Bindings from `~/.config/rencal/keys.toml`; `keys-changed` reports later edits. */
export function getKeys(): Promise<KeysSnapshot> {
  return rpc.keys.get()
}

/** Change entries in keys.toml, keeping the rest of the file as written. */
export function editKeys(edits: KeyEdit[]): Promise<KeysSnapshot> {
  return rpc.keys.edit(edits)
}

export const keys = {
  get: getKeys,
  edit: editKeys,
} as const
