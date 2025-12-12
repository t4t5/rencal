import { ReactNode } from "react"

export function Selector({
  isActive,
  children,
  onClick,
}: {
  onClick: () => void
  isActive: boolean
  children: ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-colors ${
        isActive ? "border-blue-500 bg-blue-500/10" : "border-transparent hover:border-muted"
      }`}
    >
      {children}
    </div>
  )
}
