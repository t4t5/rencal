import { FaCheck as CheckIcon, FaQuestion as QuestionIcon, FaXmark as XIcon } from "react-icons/fa6"

import type { ResponseStatus } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

const statusColors: Record<string, string> = {
  accepted: "bg-green-500",
  declined: "bg-red-500",
  tentative: "bg-yellow-500",
}

const statusIcons: Record<string, React.ReactNode> = {
  accepted: <CheckIcon className="size-2.5" style={{ color: "var(--popover)" }} />,
  declined: <XIcon className="size-2.5" style={{ color: "var(--popover)" }} />,
  tentative: <QuestionIcon className="size-2.5" style={{ color: "var(--popover)" }} />,
}

export function StatusDot({ status }: { status: ResponseStatus | null | undefined }) {
  const dotColor = statusColors[status ?? ""] ?? "bg-muted-foreground"
  const icon = statusIcons[status ?? ""]

  return (
    <span
      className={cn("size-4 rounded-circle shrink-0 flex items-center justify-center", dotColor)}
    >
      {icon}
    </span>
  )
}
