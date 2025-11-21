import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { Calendar, OAuthToken } from "@/rpc/bindings"

import { getDb } from "@/lib/db"

import { rpc } from "@/rpc"

export function CalendarConnector() {
  const [calendarResult, setCalendarResult] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [storedCalendars, setStoredCalendars] = useState<Calendar[]>([])

  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Load calendars from database on mount
  useEffect(() => {
    void loadAccessToken()
  }, [])

  async function loadAccessToken() {
    try {
      const db = await getDb()
      const result = await db.select<OAuthToken[]>("SELECT * FROM oauth_tokens WHERE provider = $1 LIMIT 1", ["GOOGLE"])
      if (result.length > 0) {
        setAccessToken(result[0].access_token)
      }
    } catch (error) {
      console.error("Failed to load access token:", error)
    }
  }

  async function saveOauthToken(oauthToken: OAuthToken) {
    const db = await getDb()

    // Step 2: Store OAuth token in database
    await db.execute(
      "INSERT OR REPLACE INTO oauth_tokens (access_token, refresh_token, expires_at, provider, created_at) VALUES ($1, $2, $3, $4, $5)",
      [oauthToken.access_token, oauthToken.refresh_token || "", oauthToken.expires_at, "GOOGLE", oauthToken.created_at],
    )
  }

  // async function fetchCalendars(accessToken: string) {
  //   const calendars = await rpc.fetch_google_calendars(accessToken)
  // }
  //
  // async function loadCalendars() {
  //   try {
  //     const db = await Database.load("sqlite:sequence.db")
  //     const result = await db.select<Calendar[]>("SELECT * FROM calendars")
  //     setStoredCalendars(result)
  //   } catch (error) {
  //     console.error("Failed to load calendars:", error)
  //   }
  // }

  async function disconnectGoogle() {
    try {
      const db = await getDb()
      await db.execute("DELETE FROM oauth_tokens WHERE provider = $1", ["GOOGLE"])
      setAccessToken(null)
    } catch (error) {
      console.error("Failed to disconnect Google:", error)
    }
  }

  async function connectGoogle() {
    setIsConnecting(true)

    try {
      // const db = await Database.load("sqlite:sequence.db")

      const oauthToken = await rpc.google_oauth()

      await saveOauthToken(oauthToken)
      await loadAccessToken()

      // Step 4: Store calendars in database
      // for (const calendar of calendars) {
      //   await db.execute("INSERT OR REPLACE INTO calendars (id, name, color, selected) VALUES ($1, $2, $3, $4)", [
      //     calendar.id,
      //     calendar.name,
      //     calendar.color || "",
      //     calendar.selected ? 1 : 0,
      //   ])
      // }

      // setCalendarResult(`Connected! Stored ${calendars.length} calendars:\n${calendars.map((c) => c.name).join("\n")}`)

      // Reload calendars from database to update UI
      // await loadCalendars()
    } catch (error) {
      setCalendarResult(`Error: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="bg-slate-900">
      <h2>Google Calendar Integration</h2>

      {accessToken ? (
        <Button variant="destructive" onClick={disconnectGoogle}>
          Sign out
        </Button>
      ) : (
        <Button onClick={connectGoogle} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Google"}
        </Button>
      )}

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
