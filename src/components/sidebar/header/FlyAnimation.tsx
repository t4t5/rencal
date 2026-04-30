/**
 * Confirmation animation for new events created from the sidebar header:
 * a translucent duplicate of the compose card detaches, shrinks, and flies
 * into the date cell in the minical where the event starts.
 *
 * We want it to feel like the card the user worked on is what's flying,
 * so we hide the original the instant the clone takes off and keep the
 * section frozen open until the flight finishes.
 *
 *   1. Caller invokes `startFlight(start)` synchronously, before resetting
 *      draft state, so we can snapshot the card at full size.
 *   2. The clone is rendered as a fixed-position overlay (see FlyToMinical)
 *      and starts its translate+scale toward the target cell.
 *   3. The original card flips to `opacity-0` and the section is held open
 *      via `isFlying` so the layout doesn't shift while the clone is in
 *      flight (otherwise it would visually detach from its starting spot).
 *   4. After FLY_HOLD_MS the flying state releases and the section collapses
 *      normally. `hideCard` stays true through the collapse so the original
 *      never flashes back into view, then resets when the card unmounts.
 */
import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useEventText } from "@/contexts/EventDraftContext"

import { type EventTime } from "@/lib/event-time"

import { FLIGHT_DURATION_MS, type FlyToMinicalHandle } from "./FlyToMinical"

// Hold the section open a bit past the flight so the clone has a moment
// to settle at the target before the original layout starts collapsing.
const POST_FLIGHT_BUFFER_MS = 300
export const FLY_HOLD_MS = FLIGHT_DURATION_MS + POST_FLIGHT_BUFFER_MS

interface FlyAnimationContextType {
  isFlying: boolean
  hideCard: boolean
  // Snapshot of the input text taken when the flight starts. The compose
  // input renders this while flying so it stays populated even after
  // `createDraftEvent` clears the live draft text.
  flyingText: string
  cardRef: RefObject<HTMLDivElement | null>
  flyRef: RefObject<FlyToMinicalHandle | null>
  startFlight: (start: EventTime) => void
  onCollapsed: () => void
}

const Ctx = createContext({} as FlyAnimationContextType)

export function useFlyAnimation() {
  return useContext(Ctx)
}

export function FlyAnimationProvider({ children }: { children: ReactNode }) {
  const { text } = useEventText()

  const [isFlying, setIsFlying] = useState(false)
  // Keeps the original card invisible through both the flight AND the
  // subsequent grid collapse so it doesn't flash back into view as the
  // section closes.
  const [hideCard, setHideCard] = useState(false)
  const [flyingText, setFlyingText] = useState("")
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<FlyToMinicalHandle>(null)

  const startFlight = useCallback(
    (start: EventTime) => {
      if (!cardRef.current) return
      flyRef.current?.fly(cardRef.current, start)
      setIsFlying(true)
      setHideCard(true)
      setFlyingText(text)
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current)
      flyTimerRef.current = setTimeout(() => {
        setIsFlying(false)
      }, FLY_HOLD_MS)
    },
    [text],
  )

  useEffect(() => {
    return () => {
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current)
    }
  }, [])

  const onCollapsed = useCallback(() => {
    setHideCard(false)
  }, [])

  const value = useMemo(
    () => ({ isFlying, hideCard, flyingText, cardRef, flyRef, startFlight, onCollapsed }),
    [isFlying, hideCard, flyingText, startFlight, onCollapsed],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
