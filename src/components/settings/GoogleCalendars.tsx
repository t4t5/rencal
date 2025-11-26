import { useEffect, useEffectEvent } from "react"

import { logger } from "@/lib/logger"
import { fetchGoogleCalendars } from "@/lib/providers/google/calendar"

import { useAuth } from "@/contexts/AuthContext"
import { useCalendar } from "@/contexts/CalendarContext"
import { useStorage } from "@/contexts/StorageContext"
import { CalendarInsertData } from "@/storage/db"

export function GoogleCalendars() {
  const { accounts, withAuthRetry } = useAuth()
  const { store } = useStorage()
  const { calendars, reloadCalendars } = useCalendar()

  const fetchCalendars = useEffectEvent(async () => {
    if (accounts.length === 0) return

    for (const account of accounts) {
      if (!account.access_token) continue

      const googleCalendars = await withAuthRetry(account, (token) => fetchGoogleCalendars(token))

      const calendars: CalendarInsertData[] = googleCalendars.map((gc) => ({
        account_id: account.id,
        provider_calendar_id: gc.id,
        name: gc.summary,
        color: gc.backgroundColor ?? null,
        selected: true,
        sync_token: null,
        last_synced_at: null,
      }))

      for (const cal of calendars) {
        logger.debug("📅 Adding calendar to store", cal)
        await store.calendar.add(cal)
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
            {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "✓" : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
