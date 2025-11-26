import { useEffect, useEffectEvent } from "react"

import { fetchGoogleCalendars } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { calendars, db } from "@/db/database"

export function GoogleCalendars() {
  const { accounts, withAuthRetry } = useAuth()
  const { calendars: calendarList, reloadCalendars } = useCalendar()

  const fetchCalendars = useEffectEvent(async () => {
    if (accounts.length === 0) return

    for (const account of accounts) {
      if (!account.access_token) continue

      const items = await withAuthRetry(account, (token) => fetchGoogleCalendars(token))

      for (const item of items) {
        await db
          .insert(calendars)
          .values({
            account_id: account.id,
            provider_calendar_id: item.id,
            name: item.summary,
            color: item.backgroundColor ?? null,
            selected: true,
          })
          .onConflictDoUpdate({
            target: [calendars.account_id, calendars.provider_calendar_id],
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
      <h3>Calendars ({calendarList.length})</h3>
      <ul>
        {calendarList.map((calendar) => (
          <li key={calendar.id}>
            {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "y" : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
