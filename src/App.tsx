import { useState } from "react"

import "@/global.css"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { rpc } from "@/rpc"

import CalendarCard from "./components/calendar-card"

function App() {
  const [greetMsg, setGreetMsg] = useState("")
  const [name, setName] = useState("")
  const [calendarResult, setCalendarResult] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)

  async function greet() {
    const msg = await rpc.greet(name)
    setGreetMsg(msg)
  }

  async function connectGoogleCalendar() {
    setIsConnecting(true)
    setCalendarResult("Starting OAuth flow...")
    try {
      const result = await rpc.start_google_oauth()
      setCalendarResult(result)
    } catch (error) {
      setCalendarResult(`Error: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  async function openPopup() {
    await rpc.create_popup()
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
      </div>

      <div>
        <h2>Popup Window Demo</h2>
        <Button onClick={openPopup}>Open Popup</Button>
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
