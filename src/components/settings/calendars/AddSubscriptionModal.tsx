import { t } from "@lingui/core/macro"
import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getErrorMessage } from "@/lib/api"

const WEBCAL_PROVIDER = "webcal"

function isSupportedCalendarUrl(value: string) {
  try {
    const url = new URL(value)
    return ["webcal:", "http:", "https:"].includes(url.protocol)
  } catch {
    return false
  }
}

export function AddSubscriptionModal({ onClose }: { onClose: () => void }) {
  const { connectWithCredentials, isConnecting } = useConnectProvider()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setError(t`Please enter a calendar URL`)
      return
    }

    if (!isSupportedCalendarUrl(trimmedUrl)) {
      setError(t`Please enter a webcal, http, or https URL`)
      return
    }

    try {
      await connectWithCredentials(WEBCAL_PROVIDER, [{ id: "url", value: trimmedUrl }])
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, t`Failed to add subscription`))
    }
  }

  return (
    <Modal onClose={onClose}>
      <DialogHeader>
        <DialogTitle>{t`Add subscription`}</DialogTitle>
        <DialogDescription>
          {t`Paste a public .ics calendar feed URL (webcal or http)`}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3 w-full">
        <Input
          variant="default"
          type="url"
          placeholder="https://example.com/calendar.ics"
          autoFocus
          value={url}
          disabled={isConnecting}
          onChange={(e) => setUrl(e.target.value)}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" disabled={isConnecting || !url.trim()} className="mt-3">
            {isConnecting ? t`Adding...` : t`Add subscription`}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
