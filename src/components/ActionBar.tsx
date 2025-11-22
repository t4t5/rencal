import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"

export function ActionBar() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="p-4 flex justify-between">
      <Button variant="secondary">+</Button>

      <div className="flex gap-2">
        {showModal && (
          <Modal onClose={() => setShowModal(false)}>
            <h1>Test</h1>
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
