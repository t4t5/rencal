import type {
  Calendar,
  ConferenceProvider as RpcConferenceProvider,
  EventConference as RpcEventConference,
} from "@/rpc/bindings"

import type { EventDateInfo } from "./event-time"

export type ConferenceProvider = "google" | "outlook" | "proton"

export type EventConference =
  | { status: "requested"; provider: ConferenceProvider }
  | { status: "live"; provider: ConferenceProvider; url: string }

export const conferenceLabel: Record<ConferenceProvider, string> = {
  google: "Google Meet",
  outlook: "Meeting",
  proton: "Meeting",
}

/** A meeting link found in free-form event text, unlike a stored `EventConference`. */
export type DetectedConference = { url: string; label: string }

const meetingUrlPatterns: [label: string, pattern: RegExp][] = [
  ["Zoom", /https?:\/\/(?:[\w-]+\.)*(?:zoom\.us|zoomgov\.com)\/(?:j|my|s|w|wc)\/[^\s<>"']+/i],
  ["Google Meet", /https?:\/\/meet\.google\.com\/[^\s<>"']+/i],
  ["Microsoft Teams", /https?:\/\/teams\.(?:microsoft|live)\.com\/[^\s<>"']+/i],
  ["Webex", /https?:\/\/(?:[\w-]+\.)*webex\.com\/[^\s<>"']+/i],
  ["Jitsi", /https?:\/\/meet\.jit\.si\/[^\s<>"']+/i],
  ["Whereby", /https?:\/\/(?:www\.)?whereby\.com\/[^\s<>"']+/i],
  ["Proton Meet", /https?:\/\/meet\.proton\.me\/[^\s<>"']+/i],
]

/** Find a known meeting link in free-form text, e.g. an event location holding a Zoom URL. */
export const detectConference = (text: string | null | undefined): DetectedConference | null => {
  if (!text) return null

  for (const [label, pattern] of meetingUrlPatterns) {
    const match = text.match(pattern)
    if (match) return { label, url: match[0].replace(/[),.;:!?\]]+$/, "") }
  }

  return null
}

/**
 * Whether an event has a video meeting: either a stored conference (live or
 * requested) or a known meeting link in its location, mirroring what the
 * event popover's conference section would show.
 */
export const hasVideoMeeting = (event: {
  conference: EventConference | null
  location: string | null
}): boolean => !!event.conference || !!detectConference(event.location)

/**
 * The link to join an event's video meeting: a live conference first, else a
 * known meeting link in its location. Requested conferences have no link yet.
 */
export const getMeetingUrl = (event: {
  conference: EventConference | null
  location: string | null
}): string | null =>
  event.conference?.status === "live"
    ? event.conference.url
    : (detectConference(event.location)?.url ?? null)

/** How long before an event starts that its "Join" button appears. */
export const JOIN_LEAD_MINUTES = 10

/** Whether an event is about to start, or still in progress, so a "Join" button makes sense. */
export const isWithinJoinWindow = (
  dateInfo: Pick<EventDateInfo, "startMs" | "endMs">,
  nowMs: number,
): boolean => nowMs >= dateInfo.startMs - JOIN_LEAD_MINUTES * 60_000 && nowMs < dateInfo.endMs

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

const rpcToConferenceProvider = (provider: RpcConferenceProvider): ConferenceProvider => {
  switch (provider) {
    case "google":
    case "outlook":
    case "proton":
      return provider
  }
}

const conferenceProviderToRpc = (provider: ConferenceProvider): RpcConferenceProvider => {
  switch (provider) {
    case "google":
    case "outlook":
    case "proton":
      return provider
  }
}

export const rpcToConference = (conference: RpcEventConference | null): EventConference | null => {
  if (!conference) return null

  const provider = rpcToConferenceProvider(conference.provider)
  return conference.status === "requested"
    ? { status: "requested", provider }
    : { status: "live", provider, url: conference.url }
}

export const conferenceToRpc = (conference: EventConference | null): RpcEventConference | null => {
  if (!conference) return null

  const provider = conferenceProviderToRpc(conference.provider)
  return conference.status === "requested"
    ? { status: "requested", provider }
    : { status: "live", provider, url: conference.url }
}
