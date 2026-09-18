import { useEffect, useState } from "react"

import { rencal, type Contact } from "@/lib/api"

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

    const unlisten = rencal.notifications.listen("events-changed", () => {
      invalidateContacts()
      load()
    })

    return () => {
      cancelled = true
      unlisten.unlisten()
    }
  }, [enabled])

  return contacts
}

function loadContacts(): Promise<Contact[]> {
  if (cachedContacts) return Promise.resolve(cachedContacts)

  contactsPromise ??= rencal.contacts.list().then((contacts) => {
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
