import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react"

const SLIDE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)"

type LeavingPanel = { key: string; content: ReactNode; dir: number }
export function SlidePresence({
  slideKey,
  direction,
  duration,
  children,
}: {
  slideKey: string
  direction: number
  duration: number
  children: ReactNode
}) {
  const [leaving, setLeaving] = useState<LeavingPanel | null>(null)
  const prevKeyRef = useRef(slideKey)
  const latestChildrenRef = useRef(children)

  if (prevKeyRef.current !== slideKey) {
    const prevKey = prevKeyRef.current
    const prevContent = latestChildrenRef.current
    prevKeyRef.current = slideKey
    if (duration > 0) {
      setLeaving({ key: prevKey, content: prevContent, dir: direction })
    } else {
      setLeaving(null)
    }
  }
  latestChildrenRef.current = children

  useEffect(() => {
    if (!leaving) return
    const t = window.setTimeout(() => {
      setLeaving((prev) => (prev && prev.key === leaving.key ? null : prev))
    }, duration * 1000)
    return () => window.clearTimeout(t)
  }, [leaving, duration])

  const enterStyle: CSSProperties =
    leaving && duration > 0
      ? {
          animation: `slide-in-y ${duration}s ${SLIDE_EASING} forwards`,
          ["--slide-from" as string]: `${direction * 100}%`,
        }
      : {}

  return (
    <>
      {leaving && (
        <div
          key={leaving.key}
          className="absolute inset-x-0 top-0"
          style={{
            animation: `slide-out-y ${duration}s ${SLIDE_EASING} forwards`,
            ["--slide-to" as string]: `${-leaving.dir * 100}%`,
          }}
        >
          {leaving.content}
        </div>
      )}
      <div key={slideKey} className="absolute inset-x-0 top-0" style={enterStyle}>
        {children}
      </div>
    </>
  )
}
