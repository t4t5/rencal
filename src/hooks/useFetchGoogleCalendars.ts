import { useState } from "react"

import { useCalendarState } from "@/contexts/CalendarStateContext"

import { logger } from "@/lib/logger"
import { fetchGoogleCalendars } from "@/lib/providers/google/calendar"

import { db, schema } from "@/db/database"
import { Account } from "@/db/types"

export const useFetchGoogleCalendars = () => {
  const [isLoading, setIsLoading] = useState(false)
  const { reloadCalendars } = useCalendarState()

  async function fetchCalendars(account: Account) {
    setIsLoading(true)
    console.log("Fetching Google calendars for account:", account)

    try {
      if (!account.accessToken) {
        throw new Error(`No access token available for account ${account.email}`)
      }

      const calendars = await fetchGoogleCalendars(account.accessToken)

      for (const cal of calendars) {
        await db
          .insert(schema.calendars)
          .values({
            accountId: account.id,
            providerCalendarId: cal.id,
            name: cal.summary,
            color: cal.backgroundColor ?? null,
          })
          .onConflictDoUpdate({
            target: [schema.calendars.accountId, schema.calendars.providerCalendarId],
            set: {
              name: cal.summary,
              color: cal.backgroundColor,
            },
          })
      }

      await reloadCalendars()
    } catch (error) {
      logger.error("Failed to fetch Google calendars:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    fetchCalendars,
    isLoading,
  }
}
