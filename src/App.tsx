import { useState } from "react";
import "./App.css";

import { createTauRPCProxy } from "./rpc/bindings";
const taurpc = createTauRPCProxy();

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [calendarResult, setCalendarResult] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  async function greet() {
    const msg = await taurpc.greet(name);
    setGreetMsg(msg);
  }

  async function connectGoogleCalendar() {
    setIsConnecting(true);
    setCalendarResult("Starting OAuth flow...");
    try {
      const result = await taurpc.start_google_oauth();
      setCalendarResult(result);
    } catch (error) {
      setCalendarResult(`Error: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <main className="container">
      <h1>Welcome to Sequence</h1>

      <div style={{ marginBottom: "2rem" }}>
        <h2>Google Calendar Integration</h2>
        <button
          onClick={connectGoogleCalendar}
          disabled={isConnecting}
          style={{ padding: "10px 20px", fontSize: "16px" }}
        >
          {isConnecting ? "Connecting..." : "Connect Google Calendar"}
        </button>
        {calendarResult && (
          <pre style={{
            marginTop: "1rem",
            padding: "1rem",
            background: "#f4f4f4",
            borderRadius: "4px",
            whiteSpace: "pre-wrap"
          }}>
            {calendarResult}
          </pre>
        )}
      </div>

      <hr />

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>
    </main>
  );
}

export default App;
