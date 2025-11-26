import { Google, generateState, generateCodeVerifier } from "arctic"
import { z } from "zod"

import { rpc } from "@/rpc"

const GOOGLE_CLIENT_ID = "988213795701-e04kh9dmf8dl8cjp1lour13g7fpp0cpp.apps.googleusercontent.com"
const GOOGLE_CLIENT_SECRET = "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"
const OAUTH_PORT = 8080
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/callback`

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
]

export async function googleOAuth() {
  const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI)
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  const authUrl = google.createAuthorizationURL(state, codeVerifier, SCOPES)

  // Add extra params for offline access:
  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("prompt", "consent")

  // Start server and open OAuth window in parallel
  const [code] = await Promise.all([
    rpc.oauth.start_oauth_callback_server(OAUTH_PORT),
    rpc.oauth.open_oauth_window(authUrl.toString(), "Sign in with Google"),
  ])

  await rpc.oauth.close_oauth_window()

  const tokens = await google.validateAuthorizationCode(code, codeVerifier)

  const email = await fetchGoogleEmail(tokens.accessToken())

  return {
    email,
    accessToken: tokens.accessToken(),
    refreshToken: tokens.refreshToken() ?? null,
    expiresAt: tokens.accessTokenExpiresAt(),
  }
}

export async function refreshGoogleToken(refreshToken: string) {
  const google = new Google(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI)
  const tokens = await google.refreshAccessToken(refreshToken)

  return {
    accessToken: tokens.accessToken(),
    refreshToken: tokens.refreshToken() ?? null,
    expiresAt: tokens.accessTokenExpiresAt(),
  }
}

const GoogleUserInfoResponseSchema = z.object({
  email: z.string().optional(),
})

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    return null
  }

  const data = GoogleUserInfoResponseSchema.parse(await response.json())
  return data.email ?? null
}
