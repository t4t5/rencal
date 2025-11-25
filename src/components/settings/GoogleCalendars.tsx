import { useEffect, useEffectEvent } from "react"

import { fetchGoogleCalendars } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { Calendar } from "@/types/calendar"

export function GoogleCalendars() {
  const { accounts, withAuthRetry } = useAuth()

  const { calendars, saveCalendars } = useCalendar()

  const fetchCalendars = useEffectEvent(async () => {
    if (accounts.length === 0) return

    // Fetch calendars for all accounts
    for (const account of accounts) {
      if (!account.access_token) continue

      const googleCalendars = await withAuthRetry(account, (token) => fetchGoogleCalendars(token))

      // Convert Google Calendar response to our Calendar type
      const accountCalendars: Calendar[] = googleCalendars.map((gc) => ({
        id: crypto.randomUUID(),
        account_id: account.id,
        provider_calendar_id: gc.id,
        name: gc.summary,
        color: gc.backgroundColor ?? null,
        selected: true,
        sync_token: null,
        last_synced_at: null,
      }))

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
