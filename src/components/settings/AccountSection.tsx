import { FaGoogle as GoogleIcon, FaApple as AppleIcon } from "react-icons/fa"
import { IconType } from "react-icons/lib"
import { PiCalendarBlank as CalendarIcon } from "react-icons/pi"

import type { Calendar } from "@/rpc/bindings"

import { CalendarItemWithVisibilityToggle } from "./CalendarItem"

const providerToIcon: Record<string, IconType> = {
  google: GoogleIcon,
  apple: AppleIcon,
}

export function AccountSection({
  provider,
  calendars,
}: {
  provider: string
  calendars: Calendar[]
}) {
  const ProviderIcon = providerToIcon[provider] ?? CalendarIcon

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ProviderIcon className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{provider}</span>
      </div>

      <div className="flex flex-col gap-3">
        {calendars.map((calendar) => {
          return <CalendarItemWithVisibilityToggle key={calendar.slug} calendar={calendar} />
        })}
      </div>
    </div>
  )
}
