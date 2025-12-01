import { z } from "zod"

import { fetchWithLog } from "@/lib/fetch"

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
  status: z.enum(["confirmed", "tentative", "cancelled"]),
  summary: z.string().optional(),
  start: GoogleEventDateTimeSchema,
  end: GoogleEventDateTimeSchema,
  location: z.string().optional(),
  updated: z.string().optional(),
  recurrence: z.array(z.string()).optional(),
  recurringEventId: z.string().optional(),
  organizer: z
    .object({
      email: z.string(),
      self: z.boolean().optional(),
    })
    .optional(),
  reminders: z
    .object({
      overrides: z
        .array(
          z.object({
            method: z.enum(["email", "popup", "sms"]),
            minutes: z.number(),
          }),
        )
        .optional(),
      useDefault: z.boolean(),
    })
    .optional(),
})

const GoogleEventsListResponseSchema = z.object({
  items: z.array(GoogleEventSchema).optional(),
  nextPageToken: z.string().optional(),
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
  const { rsp, json } = await fetchWithLog(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    "get-google-calendars",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )

  if (!rsp.ok) {
    throw new Error(`Google Calendar API error: ${rsp.status}`)
  }

  const data = GoogleCalendarListResponseSchema.parse(json)

  return data.items ?? []
}

export async function syncGoogleEvents(
  accessToken: string,
  providerCalendarId: string,
  syncToken: string | null,
): Promise<GoogleEventsSyncResult> {
  const events: GoogleEvent[] = []
  const deletedEventIds: string[] = []
  let pageToken: string | undefined
  let newSyncToken: string | null = null

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(providerCalendarId)}/events`,
    )

    if (syncToken) {
      // Incremental sync - just send the sync token
      url.searchParams.set("syncToken", syncToken)
    } else {
      // Full sync - fetch events from 1 year ago to 1 year ahead
      // Note: Without singleEvents=true, we get parent recurring events with their RRULE
      // and need to expand them locally
      const now = new Date()
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
      const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      url.searchParams.set("timeMin", oneYearAgo.toISOString())
      url.searchParams.set("timeMax", oneYearAhead.toISOString())
    }

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken)
    }

    const { rsp, json } = await fetchWithLog(url.toString(), "sync-google-events", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // Handle 410 Gone - sync token expired, need full sync
    if (rsp.status === 410) {
      return {
        events: [],
        deletedEventIds: [],
        syncToken: null,
        fullSyncRequired: true,
      }
    }

    if (!rsp.ok) {
      throw new Error(`Google Calendar API error: ${rsp.status} - ${JSON.stringify(json)}`)
    }

    const data = GoogleEventsListResponseSchema.parse(json)

    for (const event of data.items ?? []) {
      if (event.status === "cancelled") {
        deletedEventIds.push(event.id)
      } else {
        events.push(event)
      }
    }

    pageToken = data.nextPageToken

    if (data.nextSyncToken) {
      newSyncToken = data.nextSyncToken
    }
  } while (pageToken)

  return {
    events,
    deletedEventIds,
    syncToken: newSyncToken,
    fullSyncRequired: false,
  }
}
