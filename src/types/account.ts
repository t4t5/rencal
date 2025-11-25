export type Account = {
  id: string
  provider: "Google" // Future: "ICloud" | "CalDAV"
  email: string | null
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  created_at: string
}
