import {
  detectConference,
  getMeetingUrl,
  hasVideoMeeting,
  type EventConference,
} from "./conference"

/** Make a typed link openable: "example.com" → "https://example.com". */
export const toOpenableUrl = (url: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`

const urlPattern = /(?:https?:\/\/|\bwww\.)[^\s<>"']+/gi

const countChar = (text: string, char: string): number => text.split(char).length - 1

/**
 * Strip punctuation that trails a link in prose, e.g. "(see https://x.y/z)."
 * Closing brackets are only stripped when unbalanced, so a link like
 * "https://en.wikipedia.org/wiki/Foo_(bar)" keeps its ")".
 */
const trimTrailingPunctuation = (url: string): string => {
  let end = url.length

  while (end > 0) {
    const char = url[end - 1]

    if (".,;:!?".includes(char)) {
      end--
      continue
    }

    if (char === ")" || char === "]") {
      const open = char === ")" ? "(" : "["
      const head = url.slice(0, end)
      if (countChar(head, open) < countChar(head, char)) {
        end--
        continue
      }
    }

    break
  }

  return url.slice(0, end)
}

/** All web links in free-form text, in order of appearance. */
export const findUrls = (text: string | null | undefined): string[] =>
  text ? Array.from(text.matchAll(urlPattern), (match) => trimTrailingPunctuation(match[0])) : []

export type DetectedUrlSource = "location" | "description"

/** A link found in an event's free-form text, unlike its explicit `url` field. */
export type DetectedUrl = { url: string; source: DetectedUrlSource }

export const detectedUrlSourceLabel: Record<DetectedUrlSource, string> = {
  location: "Linked in event location",
  description: "Linked in event notes",
}

/**
 * The first link in an event's location or notes that isn't already shown
 * elsewhere in the event popover — as its explicit URL field, or as its video
 * meeting (a stored conference or a meeting link in the location). Meeting
 * links repeated in the notes of an event that has a video meeting are skipped
 * too, since Google/Outlook restate them there.
 */
export const detectEventUrl = (event: {
  url: string | null
  description: string | null
  location: string | null
  conference: EventConference | null
}): DetectedUrl | null => {
  const explicitUrl = event.url?.trim() ?? ""
  const meetingUrl = getMeetingUrl(event)
  const hasMeeting = hasVideoMeeting(event)

  const isShownElsewhere = (url: string): boolean =>
    (!!explicitUrl && toOpenableUrl(url) === toOpenableUrl(explicitUrl)) ||
    url === meetingUrl ||
    (hasMeeting && !!detectConference(url))

  for (const source of ["location", "description"] as const) {
    const url = findUrls(event[source]).find((candidate) => !isShownElsewhere(candidate))
    if (url) return { url, source }
  }

  return null
}
