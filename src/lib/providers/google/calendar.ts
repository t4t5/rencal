import { z } from "zod"

const GoogleCalendarSchema = z.object({
  id: z.string(),
  summary: z.string(),
  backgroundColor: z.string().optional(),
})

const GoogleCalendarListResponseSchema = z.object({
  items: z.array(GoogleCalendarSchema).optional(),
})

type GoogleCalendar = z.infer<typeof GoogleCalendarSchema>

const GoogleEventDateTimeSchema = z.object({
  date: z.string().optional(),
  dateTime: z.string().optional(),
})

const GoogleEventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  start: GoogleEventDateTimeSchema,
  end: GoogleEventDateTimeSchema,
  updated: z.string().optional(),
})

const GoogleEventsListResponseSchema = z.object({
  items: z.array(GoogleEventSchema).optional(),
  nextSyncToken: z.string().optional(),
})

export type GoogleEvent = z.infer<typeof GoogleEventSchema>

type GoogleEventsSyncResult = {
  events: GoogleEvent[]
  deletedEventIds: string[]
  syncToken: string | null
  fullSyncRequired: boolean
}

export async function fetchGoogleCalendars(accessToken: string): Promise<GoogleCalendar[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Google Calendar API error: ${response.status}`)
  }

  const data = GoogleCalendarListResponseSchema.parse(await response.json())

  return data.items ?? []
}

export async function syncGoogleEvents(
  accessToken: string,
  providerCalendarId: string,
  syncToken: string | null,
): Promise<GoogleEventsSyncResult> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(providerCalendarId)}/events`,
  )

  if (syncToken) {
    // Incremental sync - just send the sync token
    url.searchParams.set("syncToken", syncToken)
  } else {
    // Full sync - fetch events from 1 year ago to 1 year ahead
    const now = new Date()
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    url.searchParams.set("timeMin", oneYearAgo.toISOString())
    url.searchParams.set("timeMax", oneYearAhead.toISOString())
    url.searchParams.set("singleEvents", "true")
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  // Handle 410 Gone - sync token expired, need full sync
  if (response.status === 410) {
    return {
      events: [],
      deletedEventIds: [],
      syncToken: null,
      fullSyncRequired: true,
    }
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Google Calendar API error: ${response.status} - ${body}`)
  }

  const data = GoogleEventsListResponseSchema.parse(await response.json())

  const events: GoogleEvent[] = []
  const deletedEventIds: string[] = []

  for (const event of data.items ?? []) {
    if (event.status === "cancelled") {
      deletedEventIds.push(event.id)
    } else {
      events.push(event)
    }
  }

  return {
    events,
    deletedEventIds,
    syncToken: data.nextSyncToken ?? null,
    fullSyncRequired: false,
  }
}
