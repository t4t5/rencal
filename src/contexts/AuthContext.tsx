import { ReactNode, createContext, useContext, useState } from "react"

import { OAuthToken } from "@/rpc/bindings"

import { getDb } from "@/lib/db"
import { logger } from "@/lib/logger"

interface AuthContextType {
  accessToken: string | null
  resumeSession: () => Promise<void>
  saveSession: (session: OAuthToken) => Promise<void>
  clearSession: () => Promise<void>
  loggedIn: boolean
}

const AuthContext = createContext({} as AuthContextType)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<OAuthToken | null>(null)

  async function resumeSession() {
    logger.info("Resuming session from database...")

    try {
      const db = await getDb()

      const [firstResult] = await db.select<OAuthToken[]>(
        "SELECT * FROM oauth_tokens WHERE provider = $1 LIMIT 1",
        ["Google"],
      )

      if (firstResult) {
        logger.info("Loaded session from database:", firstResult)

        setSession(firstResult)
      } else {
        logger.info("No session found in database.")
      }
    } catch (error) {
      logger.error("Failed to load access token:", error)
    }
  }

  async function saveSession(session: OAuthToken) {
    logger.info("Saving session to database:", session)

    const db = await getDb()

    const { access_token, refresh_token, expires_at, provider, created_at } = session

    await db.execute(
      "INSERT OR REPLACE INTO oauth_tokens (access_token, refresh_token, expires_at, provider, created_at) VALUES ($1, $2, $3, $4, $5)",
      [access_token, refresh_token || "", expires_at, provider, created_at],
    )

    logger.info("Session saved to database.")

    setSession(session)
  }

  async function clearSession() {
    logger.info("Clearing session from database and state.")

    const db = await getDb()
    await db.execute("DELETE FROM oauth_tokens WHERE provider = $1", ["GOOGLE"])
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
