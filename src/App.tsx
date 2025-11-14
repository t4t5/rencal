import Database from "@tauri-apps/plugin-sql"
import { useState, useEffect } from "react"

import "@/global.css"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { Calendar } from "@/rpc/bindings"

import { rpc } from "@/rpc"

import CalendarCard from "./components/calendar-card"

function App() {
  const [greetMsg, setGreetMsg] = useState("")
  const [name, setName] = useState("")
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

  async function greet() {
    const msg = await rpc.greet(name)
    setGreetMsg(msg)
  }

  async function connectGoogleCalendar() {
    setIsConnecting(true)
    setCalendarResult("Starting OAuth flow...")
    try {
      // Fetch calendars from Google via OAuth
      const calendars = await rpc.start_google_oauth()

      // Store calendars in SQLite database
      const db = await Database.load("sqlite:sequence.db")

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
    <main>
      <div className="flex">
        <div className="w-full lg:w-[300px]">
          <CalendarCard />
        </div>

        <div className="hidden lg:block">BIG VIEW</div>
      </div>

      <div>
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

      <hr />

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          greet()
        }}
      >
        <Input onChange={(e) => setName(e.currentTarget.value)} placeholder="Enter a name..." />
        <Button type="submit">Greet</Button>
      </form>
      <p>{greetMsg}</p>
    </main>
  )
}

export default App
