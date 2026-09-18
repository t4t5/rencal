import { rpc } from "@/rpc"
import type { Calendar } from "@/rpc/bindings"

export type { Calendar }

export function listCalendars(): Promise<Calendar[]> {
  return rpc.caldir.list_calendars()
}

export async function createLocalCalendar(name: string, color: string | null): Promise<void> {
  await rpc.caldir.create_local_calendar(name, color)
}

export async function renameCalendar(calendarSlug: string, name: string): Promise<void> {
  await rpc.caldir.rename_calendar(calendarSlug, name)
}

export async function setCalendarColor(calendarSlug: string, color: string): Promise<void> {
  await rpc.caldir.set_calendar_color(calendarSlug, color)
}

export async function deleteCalendar(calendarSlug: string): Promise<void> {
  await rpc.caldir.delete_calendar(calendarSlug)
}
