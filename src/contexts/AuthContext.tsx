import { ReactNode, createContext, useContext, useState } from "react"

import { Session } from "@/rpc/bindings"

import { logger } from "@/lib/logger"

import { getDb } from "@/db/connection"

interface AuthContextType {
  accessToken: string | null
  resumeSession: () => Promise<void>
  saveSession: (session: Session) => Promise<void>
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

  const value = {
    accessToken: session?.access_token ?? null,
    resumeSession,
    saveSession,
    clearSession,
    loggedIn: session !== null,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
