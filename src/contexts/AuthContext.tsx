import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import { Account } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { getDb } from "@/db/connection"

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
      const refreshedAccount = await rpc.refresh_google_token(account.id, account.refresh_token)

      // Preserve email from original account (refresh doesn't return it)
      refreshedAccount.email = account.email

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
        if (typeof error === "string" && error.includes("401")) {
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
