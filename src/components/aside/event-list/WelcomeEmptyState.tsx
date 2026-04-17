import { useState } from "react"

import { AddAccountModal } from "@/components/settings/accounts/AddAccountModal"
import { Button } from "@/components/ui/button"

export function WelcomeEmptyState() {
  const [showAddAccount, setShowAddAccount] = useState(false)

  return (
    <div className="flex flex-col items-center text-center gap-2 p-6">
      <p className="text-sm text-muted-foreground">Connect your calendar to get started.</p>
      <Button size="sm" className="mt-2" onClick={() => setShowAddAccount(true)}>
        Connect a calendar
      </Button>

      {showAddAccount && <AddAccountModal onClose={() => setShowAddAccount(false)} />}
    </div>
  )
}
