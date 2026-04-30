import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react"
import { createPortal } from "react-dom"

import { type EventTime, formatDateKey } from "@/lib/event-time"

export interface FlyToMinicalHandle {
  fly: (cardEl: HTMLElement, startDate: EventTime) => void
}

interface Flight {
  id: string
  cloneHtml: string
  startRect: DOMRect
  endRect: DOMRect
}

const DURATION_MS = 450
const EASING = "cubic-bezier(0.4, 0, 0.2, 1)"

export const FlyToMinical = forwardRef<FlyToMinicalHandle>(function FlyToMinical(_, ref) {
  const [flights, setFlights] = useState<Flight[]>([])

  useImperativeHandle(
    ref,
    () => ({
      fly: (cardEl, startDate) => {
        const startRect = cardEl.getBoundingClientRect()
        console.log("[FlyToMinical] fly() called", { cardEl, startRect })
        if (startRect.width === 0 || startRect.height === 0) {
          console.warn("[FlyToMinical] startRect is empty, aborting")
          return
        }

        const dateKey = formatDateKey(startDate)
        const targetEl =
          document.querySelector<HTMLElement>(`[data-date-key="${dateKey}"]`) ??
          document.querySelector<HTMLElement>('[data-slot="calendar"]')
        console.log("[FlyToMinical] target lookup", { dateKey, targetEl })
        if (!targetEl) {
          console.warn("[FlyToMinical] no target element, aborting")
          return
        }

        const endRect = targetEl.getBoundingClientRect()
        const cloneHtml = cardEl.outerHTML
        console.log("[FlyToMinical] queueing flight", { startRect, endRect })

        setFlights((prev) => [...prev, { id: crypto.randomUUID(), cloneHtml, startRect, endRect }])
      },
    }),
    [],
  )

  const handleDone = useCallback((id: string) => {
    setFlights((prev) => prev.filter((f) => f.id !== id))
  }, [])

  return createPortal(
    <>
      {flights.map((flight) => (
        <FlightView key={flight.id} flight={flight} onDone={handleDone} />
      ))}
    </>,
    document.body,
  )
})

function FlightView({ flight, onDone }: { flight: Flight; onDone: (id: string) => void }) {
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    console.log("[FlightView] mounted", flight.id)
    let rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(() => {
        console.log("[FlightView] starting animation", flight.id)
        setAnimating(true)
      })
    })
    return () => cancelAnimationFrame(rafId)
  }, [flight.id])

  const { startRect, endRect } = flight
  const startCenterX = startRect.left + startRect.width / 2
  const startCenterY = startRect.top + startRect.height / 2
  const endCenterX = endRect.left + endRect.width / 2
  const endCenterY = endRect.top + endRect.height / 2
  const dx = endCenterX - startCenterX
  const dy = endCenterY - startCenterY
  const scale = Math.max(endRect.width / startRect.width, 0.05)

  return (
    <div
      onTransitionEnd={(e) => {
        if (e.propertyName === "transform") {
          console.log("[FlightView] transition end", flight.id)
          onDone(flight.id)
        }
      }}
      style={{
        position: "fixed",
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        opacity: animating ? 0 : 0.6,
        transform: animating
          ? `translate(${dx}px, ${dy}px) scale(${scale})`
          : "translate(0, 0) scale(1)",
        transformOrigin: "center center",
        transition: animating
          ? `transform ${DURATION_MS}ms ${EASING}, opacity ${DURATION_MS}ms ${EASING}`
          : undefined,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform, opacity",
      }}
      dangerouslySetInnerHTML={{ __html: flight.cloneHtml }}
    />
  )
}
