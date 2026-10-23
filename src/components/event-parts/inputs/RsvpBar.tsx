import { t } from "@lingui/core/macro"

import { Button } from "@/components/ui/button"

import type { ResponseStatus } from "@/lib/cal-events"

export function RsvpBar({ onRsvp }: { onRsvp: (response: ResponseStatus) => void }) {
  return (
    <div className="flex justify-between gap-1.5">
      <Button size="sm" variant="secondary" onClick={() => onRsvp("tentative")}>
        {t({ message: "Maybe", context: "rsvp" })}
      </Button>

      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onRsvp("declined")}>
          {t`Decline`}
        </Button>
        <Button size="sm" variant="default" onClick={() => onRsvp("accepted")}>
          {t`Accept`}
        </Button>
      </div>
    </div>
  )
}
