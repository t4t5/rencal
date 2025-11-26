import { useState } from "react"

import { Button } from "@/components/ui/button"

import { logger } from "@/lib/logger"
import { googleOAuth } from "@/lib/providers/google/oauth"

import { useAuth } from "@/contexts/AuthContext"
import { useStorage } from "@/contexts/StorageContext"
import { AccountInsertData } from "@/storage/db"

export function ConnectGoogle() {
  const { store } = useStorage()
  const [isConnecting, setIsConnecting] = useState(false)
  const { accounts, reloadAccounts } = useAuth()

  // Get Google accounts only
  const googleAccounts = accounts.filter((a) => a.provider === "Google")

  async function disconnectGoogle(accountId: string) {
    try {
      await store.account.delete(accountId)
      await reloadAccounts()
    } catch (error) {
      logger.error("Failed to disconnect Google:", error)
    }
  }

  async function connectGoogle() {
    setIsConnecting(true)

    try {
      const { email, accessToken, refreshToken, expiresAt } = await googleOAuth()

      const newAccount: AccountInsertData = {
        provider: "Google",
        email,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
      }

      await store.account.insert(newAccount)
      await reloadAccounts()
    } catch (error) {
      logger.error("Failed to connect Google:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {googleAccounts.map((account) => (
        <div key={account.id} className="flex items-center justify-between gap-2">
          <span>{account.email ?? "Unknown email"}</span>
          <Button variant="destructive" size="sm" onClick={() => disconnectGoogle(account.id)}>
            Disconnect
          </Button>
        </div>
      ))}

      <Button onClick={connectGoogle} disabled={isConnecting}>
        {isConnecting
          ? "Connecting..."
          : accounts.length
            ? "Add another account"
            : "Connect Google"}
      </Button>
    </div>
  )
}
