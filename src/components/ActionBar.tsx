import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"

import { Settings } from "./settings/Settings"

export function ActionBar() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="p-4 flex justify-between">
      <Button variant="secondary">+</Button>

      <div className="flex gap-2">
        {showModal && (
          <Modal onClose={() => setShowModal(false)}>
            <Settings />
          </Modal>
        )}

        <Button variant="secondary" onClick={() => setShowModal(true)}>
          Settings
        </Button>
        <Button variant="secondary">Search</Button>
      </div>
    </div>
  )
}
