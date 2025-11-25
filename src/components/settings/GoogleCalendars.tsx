import { useEffect, useEffectEvent } from "react"

import { rpc } from "@/rpc"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"

export function GoogleCalendars() {
  const { accounts, withAuthRetry } = useAuth()

  const { calendars, saveCalendars } = useCalendar()

  const fetchCalendars = useEffectEvent(async () => {
    if (accounts.length === 0) return

    // Fetch calendars for all accounts
    for (const account of accounts) {
      if (!account.access_token) continue

      const accountCalendars = await withAuthRetry(account, (token) =>
        rpc.fetch_google_calendars(account.id, token),
      )
      saveCalendars(accountCalendars)
    }
  })

  useEffect(() => {
    void fetchCalendars()
  }, [accounts])

  return (
    <div>
      <h3>Calendars ({calendars.length})</h3>
      <ul>
        {calendars.map((calendar) => (
          <li key={calendar.id}>
            {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "✓" : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
