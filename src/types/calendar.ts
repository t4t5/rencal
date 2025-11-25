export type Calendar = {
  id: string
  account_id: string
  provider_calendar_id: string | null
  name: string
  color: string | null
  selected: boolean
  sync_token: string | null
  last_synced_at: string | null
}
