import type {
  Calendar,
  ConferenceProvider as RpcConferenceProvider,
  EventConference as RpcEventConference,
} from "@/rpc/bindings"

export type ConferenceProvider = "google" | "outlook" | "proton"

export type EventConference =
  | { status: "requested"; provider: ConferenceProvider }
  | { status: "live"; provider: ConferenceProvider; url: string }

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
