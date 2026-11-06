/*
 * Confirmation animation for events created from the sidebar: the compose card
 * flies into the minical cell of the day the event starts on, shrinking and
 * fading as it goes.
 *
 * The web version cloned the card's DOM and flew the clone in a portal. A motion
 * moves the card itself, natively, so there's nothing to clone: the section stays
 * open while `isFlying`, the card keeps showing the draft it's carrying
 * (`holdDraft`), and stays at the motion's end, invisible, until it unmounts.
 */
import { type Motion, signal, untracked, type ViewRef } from "nsh"

import { type EventTime, dateInViewerZone, epochDay } from "@/lib/event-time"

import { draftText, holdDraft, releaseDraft } from "@/stores/draft"

const FLIGHT_DURATION_MS = 650
// Hold the section open past the flight, so the card settles before it collapses.
const POST_FLIGHT_BUFFER_MS = 300

type FlyTarget = { day: () => number; ref: () => ViewRef | undefined }

const flying = signal(false)
const text = signal("")
const targets = new Set<FlyTarget>()
let card: { ref: () => ViewRef | undefined; motion: Motion } | null = null
let holdTimer: ReturnType<typeof setTimeout> | undefined

export const isFlying = () => flying()
/** The input keeps what was typed through the flight, after the draft has cleared. */
export const flyingText = () => text()

/** A minical day the card can land on; returns how to remove it. */
export function registerFlyTarget(target: FlyTarget) {
  targets.add(target)
  return () => void targets.delete(target)
}

export function bindFlightCard(ref: () => ViewRef | undefined, motion: Motion) {
  card = { ref, motion }
  return () => {
    card = null
  }
}

async function targetFor(start: EventTime) {
  const day = epochDay(dateInViewerZone(start))
  const cell = [...targets].find((target) => target.day() === day) ?? [...targets][0]
  return cell?.ref()?.measure()
}

export function startFlight(start: EventTime) {
  flying.set(true)
  text.set(untracked(draftText))
  clearTimeout(holdTimer)
  holdDraft()
  holdTimer = setTimeout(() => {
    flying.set(false)
    releaseDraft()
  }, FLIGHT_DURATION_MS + POST_FLIGHT_BUFFER_MS)
  void fly(start)
}

async function fly(start: EventTime) {
  const flight = card
  const [from, to] = await Promise.all([flight?.ref()?.measure(), targetFor(start)])
  if (!flight || !from) return
  // No cell for that day: fade where it is.
  const size = from.bounds.size
  const dx = to
    ? to.pagePosition.x + to.bounds.size.width / 2 - from.pagePosition.x - size.width / 2
    : 0
  const dy = to
    ? to.pagePosition.y + to.bounds.size.height / 2 - from.pagePosition.y - size.height / 2
    : 0
  const scale = to ? Math.max(to.bounds.size.width / size.width, 0.05) : 1
  void flight.motion.play({
    duration: FLIGHT_DURATION_MS,
    easing: "easeInOut",
    keyframes: {
      opacity: [1, 0],
      translateX: [0, dx],
      translateY: [0, dy],
      scale: [1, scale],
    },
  })
}
