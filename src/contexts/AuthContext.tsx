import { ReactNode, createContext, useContext, useEffect, useState } from "react"

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

  const value = {
    accessToken: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null,
    resumeSession,
    saveSession,
    refreshSession,
    clearSession,
    loggedIn: session !== null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
