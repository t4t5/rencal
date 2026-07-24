import type { Calendar, ConferenceProvider, EventConference } from "@/rpc/bindings"

import type { DraftEvent } from "@/contexts/EventDraftContext"

export const REQUESTED_MEET: EventConference = {
  status: "requested",
  provider: "google",
}

export const conferenceJoinLabel: Record<ConferenceProvider, string> = {
  google: "Join Google Meet",
  outlook: "Join Meeting",
  proton: "Join Meeting",
}

export const calendarSupportsMeet = (calendar?: Calendar) => calendar?.provider === "google"

export const draftConference = (
  draft: Pick<DraftEvent, "requestGoogleMeet">,
): EventConference | null => (draft.requestGoogleMeet ? REQUESTED_MEET : null)
