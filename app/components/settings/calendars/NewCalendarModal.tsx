import { LocalCalendarForm } from "@/components/settings/accounts/LocalCalendarForm"
import { Dialog } from "@/components/ui/dialog"

export function NewCalendarModal(props: { onClose: () => void }) {
  return (
    <Dialog
      open
      class="w-[425px]"
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <LocalCalendarForm onClose={props.onClose} />
    </Dialog>
  )
}
