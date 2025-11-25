import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react"

import { logger } from "@/lib/logger"
import { refreshGoogleToken } from "@/lib/providers/google/oauth"

import { getDb } from "@/db/connection"
import { Account } from "@/types/account"

interface AuthContextType {
  accounts: Account[]
  loadAccounts: () => Promise<void>
  saveAccount: (account: Account) => Promise<void>
  refreshAccount: (account: Account) => Promise<Account | null>
  deleteAccount: (accountId: string) => Promise<void>
  hasAccounts: boolean
  withAuthRetry: <T>(account: Account, operation: (token: string) => Promise<T>) => Promise<T>
}

const AuthContext = createContext({} as AuthContextType)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])

  async function loadAccounts() {
    logger.info("Loading accounts from database...")

    try {
      const db = await getDb()
      const loadedAccounts = await db.account.getAll()

      logger.info(`Loaded ${loadedAccounts.length} account(s) from database`)
      setAccounts(loadedAccounts)
    } catch (error) {
      logger.error("Failed to load accounts:", error)
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  async function saveAccount(account: Account) {
    logger.info("Saving account to database:", account.email)

    const db = await getDb()
    await db.account.insert(account)

    logger.info("Account saved to database.")

    // Reload accounts to get fresh state
    await loadAccounts()
  }

  async function deleteAccount(accountId: string) {
    logger.info("Deleting account:", accountId)

    const db = await getDb()
    await db.account.delete(accountId)

    logger.info("Account deleted.")

    // Reload accounts to get fresh state
    await loadAccounts()
  }

  async function refreshAccount(account: Account): Promise<Account | null> {
    if (!account.refresh_token) {
      logger.error("No refresh token available for account:", account.id)
      return null
    }

    logger.info("Refreshing access token for account:", account.email)

    try {
      const tokenData = await refreshGoogleToken(account.refresh_token)
      const refreshedAccount: Account = {
        ...account,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? account.refresh_token,
        expires_at: tokenData.expires_at,
      }

      await saveAccount(refreshedAccount)

      logger.info("Access token refreshed successfully")
      return refreshedAccount
    } catch (error) {
      logger.error("Failed to refresh access token:", error)
      // If refresh fails, delete the account so user can re-authenticate
      await deleteAccount(account.id)
      return null
    }
  }

  const withAuthRetry = useCallback(
    async <T,>(account: Account, operation: (token: string) => Promise<T>): Promise<T> => {
      const token = account.access_token

      if (!token) {
        throw new Error("No access token available for account")
      }

      try {
        return await operation(token)
      } catch (error) {
        // Check if it's a 401 error (expired token)
        if (error instanceof Error && error.message.includes("401")) {
          logger.warn("Token expired, attempting to refresh...")

          const refreshedAccount = await refreshAccount(account)

          if (refreshedAccount?.access_token) {
            logger.info("Token refreshed, retrying operation...")
            return await operation(refreshedAccount.access_token)
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
    loadAccounts,
    saveAccount,
    refreshAccount,
    deleteAccount,
    hasAccounts: accounts.length > 0,
    withAuthRetry,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
