import { useState } from "react"

import "./App.css"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { createTauRPCProxy } from "@/rpc/bindings"

const taurpc = createTauRPCProxy()

function App() {
  const [greetMsg, setGreetMsg] = useState("")
  const [name, setName] = useState("")
  const [calendarResult, setCalendarResult] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)

  async function greet() {
    const msg = await taurpc.greet(name)
    setGreetMsg(msg)
  }

  async function connectGoogleCalendar() {
    setIsConnecting(true)
    setCalendarResult("Starting OAuth flow...")
    try {
      const result = await taurpc.start_google_oauth()
      setCalendarResult(result)
    } catch (error) {
      setCalendarResult(`Error: ${error}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <main className="container">
      <h1 className="font-bold">Welcome to Sequence</h1>

      <div>
        <h2>Google Calendar Integration</h2>
        <Button onClick={connectGoogleCalendar} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Google Calendar"}
        </Button>
        {calendarResult && <pre>{calendarResult}</pre>}
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
