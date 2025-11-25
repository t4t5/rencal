import { Google, generateState, generateCodeVerifier } from "arctic"
import { z } from "zod"

import { rpc } from "@/rpc"

import type { Account } from "@/types/account"

// Zod schema for Google userinfo API response
const GoogleUserInfoResponseSchema = z.object({
  email: z.string().optional(),
})

// Zod schema for Google Calendar API response
const GoogleCalendarSchema = z.object({
  id: z.string(),
  summary: z.string(),
  backgroundColor: z.string().optional(),
})

const GoogleCalendarListResponseSchema = z.object({
  items: z.array(GoogleCalendarSchema).optional(),
})

export type GoogleCalendar = z.infer<typeof GoogleCalendarSchema>

// Zod schema for Google Calendar Events API response
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

export type GoogleEventsSyncResult = {
  events: GoogleEvent[]
  deletedEventIds: string[]
  syncToken: string | null
  fullSyncRequired: boolean
}

const GOOGLE_CLIENT_ID = "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com"
const GOOGLE_CLIENT_SECRET = "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"
const OAUTH_PORT = 8080
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
]

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    return null
  }

  const data = GoogleUserInfoResponseSchema.parse(await response.json())
  return data.email ?? null
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

export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string | null
  expires_at: string
}> {
  const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI)
  const tokens = await google.refreshAccessToken(refreshToken)

  const now = new Date()
  const expiresInSeconds = tokens.accessTokenExpiresInSeconds() ?? 3600
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)

  return {
    access_token: tokens.accessToken(),
    // Google doesn't return new refresh token on refresh
    refresh_token: tokens.refreshToken() ?? null,
    expires_at: expiresAt.toISOString(),
  }
}

export async function googleOAuth(): Promise<Account> {
  const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  const authUrl = google.createAuthorizationURL(state, codeVerifier, SCOPES)
  // Add extra params for offline access
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")

  // Start server and open window in parallel
  const [code] = await Promise.all([
    rpc.oauth.start_oauth_callback_server(OAUTH_PORT),
    rpc.oauth.open_oauth_window(authUrl.toString(), "Sign in with Google"),
  ])

  // Close the OAuth popup window
  await rpc.oauth.close_oauth_window()

  // Exchange code for tokens
  const tokens = await google.validateAuthorizationCode(code, codeVerifier)

  // Fetch user email
  const email = await fetchGoogleEmail(tokens.accessToken())

  const now = new Date()
  const expiresInSeconds = tokens.accessTokenExpiresInSeconds() ?? 3600
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)

  return {
    id: crypto.randomUUID(),
    provider: "Google",
    email,
    access_token: tokens.accessToken(),
    refresh_token: tokens.refreshToken() ?? null,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
  }
}
