export type Event = {
  id: string
  provider_event_id: string | null
  calendar_id: string
  summary: string
  start: string
  end: string
  all_day: boolean
  updated_at: string | null
}
