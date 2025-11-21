import Database from "@tauri-apps/plugin-sql"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { Calendar } from "@/rpc/bindings"

import { rpc } from "@/rpc"

export function CalendarConnector() {
  const [calendarResult, setCalendarResult] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [storedCalendars, setStoredCalendars] = useState<Calendar[]>([])

  // Load calendars from database on mount
  useEffect(() => {
    loadCalendars()
  }, [])

  async function loadCalendars() {
    try {
      const db = await Database.load("sqlite:sequence.db")
      const result = await db.select<Calendar[]>("SELECT * FROM calendars")
      setStoredCalendars(result)
    } catch (error) {
      console.error("Failed to load calendars:", error)
    }
  }

  async function connectGoogleCalendar() {
    setIsConnecting(true)
    setCalendarResult("Starting OAuth flow...")

    try {
      const db = await Database.load("sqlite:sequence.db")

      // Step 1: Perform OAuth and get tokens
      const oauthToken = await rpc.google_oauth()

      // Step 2: Store OAuth token in database
      await db.execute(
        "INSERT OR REPLACE INTO oauth_tokens (access_token, refresh_token, expires_at, provider, created_at) VALUES ($1, $2, $3, $4, $5)",
        [oauthToken.access_token, oauthToken.refresh_token || "", oauthToken.expires_at, "GOOGLE", oauthToken.created_at],
      )

      // Step 3: Fetch calendars using the access token
      const calendars = await rpc.fetch_google_calendars(oauthToken.access_token)

      // Step 4: Store calendars in database
      for (const calendar of calendars) {
        await db.execute("INSERT OR REPLACE INTO calendars (id, name, color, selected) VALUES ($1, $2, $3, $4)", [
          calendar.id,
          calendar.name,
          calendar.color || "",
          calendar.selected ? 1 : 0,
        ])
      }

      setCalendarResult(`Connected! Stored ${calendars.length} calendars:\n${calendars.map((c) => c.name).join("\n")}`)

      // Reload calendars from database to update UI
      await loadCalendars()
    } catch (error) {
      setCalendarResult(`Error: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="bg-slate-900">
      <h2>Google Calendar Integration</h2>
      <Button onClick={connectGoogleCalendar} disabled={isConnecting}>
        {isConnecting ? "Connecting..." : "Connect Google Calendar"}
      </Button>
      {calendarResult && <pre>{calendarResult}</pre>}

      {storedCalendars.length > 0 && (
        <div>
          <h3>Stored Calendars ({storedCalendars.length})</h3>
          <ul>
            {storedCalendars.map((calendar) => (
              <li key={calendar.id}>
                {calendar.name} {calendar.color && `(${calendar.color})`} {calendar.selected ? "✓" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
