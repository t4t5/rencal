import type { ReactNode } from "react"

import "./global.css"

export default function Decorator({ children }: { children: ReactNode }) {
  return <div className="dark bg-background text-foreground">{children}</div>
}
