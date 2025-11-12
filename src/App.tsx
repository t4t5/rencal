import { useState } from "react";
import "./App.css";

import { createTauRPCProxy } from "./rpc/bindings";
const taurpc = createTauRPCProxy();

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    const msg = await taurpc.greet(name);
    setGreetMsg(msg);
  }

  return (
    <main className="container">
      <h1>Welcome to Sequence</h1>

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
