import { eq } from "drizzle-orm"
import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react"

import { logger } from "@/lib/logger"
import { refreshGoogleToken } from "@/lib/providers/google/oauth"

import { schema, db } from "@/db/database"
import type { Account } from "@/db/types"

interface AuthContextType {
  accounts: Account[]
  reloadAccounts: () => Promise<void>
  refreshAccountAuth: (account: Account) => Promise<Account | null>
  withAuthRetry: <T>(account: Account, operation: (token: string) => Promise<T>) => Promise<T>
}

const AuthContext = createContext({} as AuthContextType)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])

  async function loadAccounts() {
    const result = await db.select().from(schema.accounts)
    logger.debug("Accounts loaded from store:", result.length)
    setAccounts(result)
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  async function refreshAccountAuth(account: Account): Promise<Account | null> {
    if (!account.refreshToken) {
      logger.error("No refresh token available for account:", account.id)
      return null
    }

    logger.info("Refreshing access token for account:", account.email)

    try {
      const { accessToken, refreshToken, expiresAt } = await refreshGoogleToken(
        account.refreshToken,
      )

      const refreshedAccount: Account = {
        ...account,
        accessToken,
        refreshToken: refreshToken ?? account.refreshToken,
        expiresAt,
      }

      await db
        .update(schema.accounts)
        .set(refreshedAccount)
        .where(eq(schema.accounts.id, account.id))

      logger.info("Access token refreshed successfully")
      return refreshedAccount
    } catch (error) {
      logger.error("Failed to refresh access token:", error)
      return null
    }
  }

  const withAuthRetry = useCallback(
    async <T,>(account: Account, operation: (token: string) => Promise<T>): Promise<T> => {
      const token = account.accessToken

      if (!token) {
        throw new Error("No access token available for account")
      }

      try {
        return await operation(token)
      } catch (error) {
        // Check if it's a 401 error (expired token)
        if (error instanceof Error && error.message.includes("401")) {
          logger.warn("Token expired, attempting to refresh...")

          const refreshedAccount = await refreshAccountAuth(account)

          if (refreshedAccount?.accessToken) {
            logger.info("Token refreshed, retrying operation...")
            return await operation(refreshedAccount.accessToken)
          } else {
            logger.error("Failed to refresh token")
            throw error
          }
        }

        // Re-throw non-401 errors
        throw error
      }
    },
    [],
  )

  const value = {
    accounts,
    reloadAccounts: loadAccounts,
    refreshAccountAuth,
    withAuthRetry,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
