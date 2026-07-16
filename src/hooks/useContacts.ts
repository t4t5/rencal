import { listen } from "@tauri-apps/api/event"
import { useEffect, useState } from "react"

import { rpc } from "@/rpc"
import type { Contact } from "@/rpc/bindings"
import { CALDIR_CHANGED } from "@/rpc/events"

let cachedContacts: Contact[] | null = null
let contactsPromise: Promise<Contact[]> | null = null

export function useContacts(enabled: boolean) {
  const [contacts, setContacts] = useState<Contact[]>(cachedContacts ?? [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const load = () => {
      void loadContacts().then((loaded) => {
        if (!cancelled) {
          setContacts(loaded)
        }
      })
    }

    load()

    const unlisten = listen(CALDIR_CHANGED, () => {
      invalidateContacts()
      load()
    })

    return () => {
      cancelled = true
      unlisten.then((fn) => fn())
    }
  }, [enabled])

  return contacts
}

function loadContacts(): Promise<Contact[]> {
  if (cachedContacts) return Promise.resolve(cachedContacts)

  contactsPromise ??= rpc.caldir.list_contacts().then((contacts) => {
    cachedContacts = contacts
    contactsPromise = null
    return contacts
  })

  return contactsPromise
}

function invalidateContacts() {
  cachedContacts = null
  contactsPromise = null
}
