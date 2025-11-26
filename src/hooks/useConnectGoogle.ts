import { eq } from "drizzle-orm"
import { useState } from "react"

import { useAuth } from "@/contexts/AuthContext"

import { logger } from "@/lib/logger"
import { googleOAuth } from "@/lib/providers/google/oauth"

import { schema, db } from "@/db/database"
import { Account } from "@/db/types"

export const useConnectGoogle = ({ onConnect }: { onConnect: (account: Account) => void }) => {
  const [isConnecting, setIsConnecting] = useState(false)
  const { reloadAccounts } = useAuth()

  async function connect() {
    setIsConnecting(true)

    try {
      const { email, accessToken, refreshToken, expiresAt } = await googleOAuth()

      await db.insert(schema.accounts).values({
        provider: "Google",
        email,
        accessToken,
        refreshToken,
        expiresAt,
      })
      // returning() does not seem to work unfortunately...

      // Fetch newly created account:
      const [account] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.accessToken, accessToken))

      onConnect(account)

      await reloadAccounts()
    } catch (error) {
      logger.error("Failed to connect Google:", error)
    } finally {
      setIsConnecting(false)
    }
  }

  return {
    connect,
    isConnecting,
  }
}
