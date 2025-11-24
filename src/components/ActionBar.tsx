import { useState } from "react"
import { FaPlus as PlusIcon } from "react-icons/fa6"
import { HiOutlineCog8Tooth as SettingsIcon } from "react-icons/hi2"
import { IoSearch as SearchIcon } from "react-icons/io5"

import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/dialog"

import { Settings } from "./settings/Settings"

export function ActionBar() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="p-4 flex justify-between">
      <Button variant="secondary">
        <PlusIcon />
      </Button>

      <div className="flex gap-2">
        {showModal && (
          <Modal onClose={() => setShowModal(false)}>
            <Settings />
          </Modal>
        )}

        <Button variant="secondary" onClick={() => setShowModal(true)}>
          <SettingsIcon />
        </Button>
        <Button variant="secondary">
          <SearchIcon />
        </Button>
      </div>
    </div>
  )
}
