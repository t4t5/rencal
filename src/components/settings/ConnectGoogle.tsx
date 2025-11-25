import { useState } from "react"

import { Button } from "@/components/ui/button"

import { logger } from "@/lib/logger"
import { googleOAuth } from "@/lib/providers/google/oauth"

import { useAuth } from "@/contexts/AuthContext"

export function ConnectGoogle() {
  const [isConnecting, setIsConnecting] = useState(false)
  const { accounts, hasAccounts, deleteAccount, saveAccount } = useAuth()

  // Get Google accounts only
  const googleAccounts = accounts.filter((a) => a.provider === "Google")

  async function disconnectGoogle(accountId: string) {
    try {
      await deleteAccount(accountId)
    } catch (error) {
      logger.error("Failed to disconnect Google:", error)
    }
  }

  async function connectGoogle() {
    setIsConnecting(true)

    try {
      const account = await googleOAuth()
      await saveAccount(account)
    } catch (error) {
      logger.error("Failed to connect Google:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {googleAccounts.length > 0 ? (
        <>
          <h2>Connected Google accounts</h2>
          {googleAccounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between gap-2">
              <span>{account.email ?? "Unknown email"}</span>
              <Button variant="destructive" size="sm" onClick={() => disconnectGoogle(account.id)}>
                Disconnect
              </Button>
            </div>
          ))}
        </>
      ) : (
        <h2>Connect Google account</h2>
      )}

      <Button onClick={connectGoogle} disabled={isConnecting}>
        {isConnecting ? "Connecting..." : hasAccounts ? "Add another account" : "Connect Google"}
      </Button>
    </div>
  )
}
