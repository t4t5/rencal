import { LocalCalendarForm } from "@/components/settings/accounts/LocalCalendarForm"
import { Modal } from "@/components/ui/dialog"

export function NewCalendarModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <LocalCalendarForm onClose={onClose} />
    </Modal>
  )
}
