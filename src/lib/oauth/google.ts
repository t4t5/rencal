import { Google, generateState, generateCodeVerifier } from "arctic"

import { rpc } from "@/rpc"
import type { Account } from "@/rpc/bindings"

const GOOGLE_CLIENT_ID = "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com"
const GOOGLE_CLIENT_SECRET = "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"
const OAUTH_PORT = 8080
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
]

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    return null
  }

  const data = await response.json()
  return data.email ?? null
}

export async function googleOAuth(): Promise<Account> {
  const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  const authUrl = google.createAuthorizationURL(state, codeVerifier, SCOPES)
  // Add extra params for offline access
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")

  // Start server and open window in parallel
  const [code] = await Promise.all([
    rpc.oauth.start_oauth_callback_server(OAUTH_PORT),
    rpc.oauth.open_oauth_window(authUrl.toString(), "Sign in with Google"),
  ])

  // Close the OAuth popup window
  await rpc.oauth.close_oauth_window()

  // Exchange code for tokens
  const tokens = await google.validateAuthorizationCode(code, codeVerifier)

  // Fetch user email
  const email = await fetchGoogleEmail(tokens.accessToken())

  const now = new Date()
  const expiresInSeconds = tokens.accessTokenExpiresInSeconds() ?? 3600
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000)

  return {
    id: crypto.randomUUID(),
    provider: "Google",
    email,
    access_token: tokens.accessToken(),
    refresh_token: tokens.refreshToken() ?? null,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
  }
}
