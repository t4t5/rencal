import { rpc } from "@/rpc"
import type { Contact } from "@/rpc/bindings"

export type { Contact }

/** Attendees seen across local events, for autocomplete. */
export function listContacts(): Promise<Contact[]> {
  return rpc.caldir.list_contacts()
}

export const contacts = { list: listContacts } as const
