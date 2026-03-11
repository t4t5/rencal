import { Button } from "@/components/ui/button"

export function RsvpBar({ onRsvp }: { onRsvp: (response: string) => void }) {
  return (
    <div className="flex gap-1.5 p-3 justify-between">
      <Button size="sm" variant="secondary" onClick={() => onRsvp("tentative")}>
        Maybe
      </Button>

      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => onRsvp("declined")}>
          Decline
        </Button>
        <Button size="sm" variant="default" onClick={() => onRsvp("accepted")}>
          Accept
        </Button>
      </div>
    </div>
  )
}
