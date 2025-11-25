import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react"

import { rpc } from "@/rpc"
import { Session } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { getDb } from "@/db/connection"

interface AuthContextType {
  accessToken: string | null
  refreshToken: string | null
  resumeSession: () => Promise<void>
  saveSession: (session: Session) => Promise<void>
  refreshSession: () => Promise<string | null>
  clearSession: () => Promise<void>
  loggedIn: boolean
  withAuthRetry: <T>(operation: (token: string) => Promise<T>) => Promise<T>
}

const AuthContext = createContext({} as AuthContextType)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  async function resumeSession() {
    logger.info("Resuming session from database...")

    try {
      const db = await getDb()
      const session = await db.session.get()

      if (session) {
        logger.info("Loaded session from database:", session)

        setSession(session)
      } else {
        logger.info("No session found in database.")
      }
    } catch (error) {
      logger.error("Failed to load access token:", error)
    }
  }

  useEffect(() => {
    void resumeSession()
  }, [])

  async function saveSession(session: Session) {
    logger.info("Saving session to database:", session)

    const db = await getDb()
    await db.session.insert(session)

    logger.info("Session saved to database.")

    setSession(session)
  }

  async function clearSession() {
    logger.info("Clearing session from database and state.")

    const db = await getDb()
    await db.session.delete()
    setSession(null)

    logger.info("Session cleared.")
  }

  async function refreshSession(): Promise<string | null> {
    if (!session?.refresh_token) {
      logger.error("No refresh token available")
      return null
    }

    logger.info("Refreshing access token...")

    try {
      const newSession = await rpc.refresh_google_token(session.refresh_token)

      await saveSession(newSession)

      logger.info("Access token refreshed successfully")
      return newSession.access_token
    } catch (error) {
      logger.error("Failed to refresh access token:", error)
      // If refresh fails, clear the session so user can re-authenticate
      await clearSession()
      return null
    }
  }

  const withAuthRetry = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      const token = session?.access_token

      if (!token) {
        throw new Error("No access token available")
      }

      try {
        return await operation(token)
      } catch (error) {
        // Check if it's a 401 error (expired token)
        if (typeof error === "string" && error.includes("401")) {
          logger.warn("Token expired, attempting to refresh...")

          const newToken = await refreshSession()

          if (newToken) {
            logger.info("Token refreshed, retrying operation...")
            return await operation(newToken)
          } else {
            logger.error("Failed to refresh token")
            throw error
          }
        }

        // Re-throw non-401 errors
        throw error
      }
    },
    [session?.access_token],
  )

  const value = {
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    resumeSession,
    saveSession,
    refreshSession,
    clearSession,
    loggedIn: session !== null,
    withAuthRetry,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
