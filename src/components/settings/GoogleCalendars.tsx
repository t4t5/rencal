import { useEffect, useEffectEvent } from "react"

import { fetchGoogleCalendars } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { schema, db } from "@/db/database"

export function GoogleCalendars() {
  const { accounts, withAuthRetry } = useAuth()
  const { calendars, reloadCalendars } = useCalendar()

  const fetchCalendars = useEffectEvent(async () => {
    if (accounts.length === 0) return

    for (const account of accounts) {
      if (!account.access_token) continue

      const items = await withAuthRetry(account, (token) => fetchGoogleCalendars(token))

      for (const item of items) {
        await db
          .insert(schema.calendars)
          .values({
            account_id: account.id,
            provider_calendar_id: item.id,
            name: item.summary,
            color: item.backgroundColor ?? null,
            selected: true,
          })
          .onConflictDoUpdate({
            target: [schema.calendars.account_id, schema.calendars.provider_calendar_id],
            set: {
              name: item.summary,
              color: item.backgroundColor,
            },
          })
      }

      reloadCalendars()
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
            {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "y" : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
