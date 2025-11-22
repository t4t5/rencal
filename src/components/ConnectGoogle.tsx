import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { rpc } from "@/rpc"

import { logger } from "@/lib/logger"

import { useAuth } from "@/contexts/AuthContext"

export function ConnectGoogle() {
  const [isConnecting, setIsConnecting] = useState(false)
  const { loggedIn, resumeSession, clearSession, saveSession } = useAuth()

  useEffect(() => {
    void resumeSession()
  }, [])

  async function disconnectGoogle() {
    try {
      await clearSession()
    } catch (error) {
      logger.error("Failed to disconnect Google:", error)
    }
  }

  async function connectGoogle() {
    setIsConnecting(true)

    try {
      const session = await rpc.google_oauth()
      await saveSession(session)
    } catch (error) {
      logger.error("Failed to connect Google:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="bg-slate-900">
      <h2>Connect Google account</h2>

      {loggedIn ? (
        <Button variant="destructive" onClick={disconnectGoogle}>
          Sign out
        </Button>
      ) : (
        <Button onClick={connectGoogle} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Google"}
        </Button>
      )}
    </div>
  )
}
