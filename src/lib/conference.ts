import type { Calendar, ConferenceProvider, EventConference } from "@/rpc/bindings"

export const conferenceLabel: Record<ConferenceProvider, string> = {
  google: "Google Meet",
  outlook: "Meeting",
  proton: "Meeting",
}

/** The conference provider renCal can provision for events on this calendar, if any. */
export const calendarConferenceProvider = (calendar?: Calendar): ConferenceProvider | null =>
  calendar?.provider === "google" ? "google" : null

/** Drop a requested conference when the target calendar can't provision it. */
export const conferenceForCalendar = (
  conference: EventConference | null,
  calendar?: Calendar,
): EventConference | null =>
  conference?.status === "requested" && conference.provider !== calendarConferenceProvider(calendar)
    ? null
    : conference
