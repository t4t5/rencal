import type { ResponseStatus } from "@/rpc/bindings"

import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { CloseIcon } from "@/icons/close"
import { QuestionMarkIcon } from "@/icons/question-mark"

const statusColors: Record<string, string> = {
  accepted: "bg-success",
  declined: "bg-error",
  tentative: "bg-warning",
}

const statusIcons: Record<string, React.ReactNode> = {
  accepted: <CheckIcon className="size-3 text-bgPrimary" />,
  declined: <CloseIcon className="size-3 text-bgPrimary" />,
  tentative: <QuestionMarkIcon className="size-3 text-bgPrimary" />,
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
