import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"

import type { ProviderField } from "@/rpc/bindings"

import { getProviderDisplayName } from "@/lib/providers"

import { CredentialsForm } from "./CredentialsForm"
import { LocalCalendarForm } from "./LocalCalendarForm"
import { ProviderList } from "./ProviderList"

export type ModalStep =
  | { kind: "select-provider" }
  | { kind: "setup"; provider: string; instructions: string; fields: ProviderField[] }
  | { kind: "credentials"; provider: string; fields: ProviderField[] }
  | { kind: "local-calendar" }

export function AddAccountModal({
  onClose,
  showLocalOnlyOption,
}: {
  onClose: () => void
  showLocalOnlyOption?: boolean
}) {
  const [step, setStep] = useState<ModalStep>({ kind: "select-provider" })

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-6">
        {step.kind === "select-provider" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect calendar</DialogTitle>
            </DialogHeader>

            <ProviderList onClose={onClose} onSetStep={setStep} />

            {showLocalOnlyOption && (
              <div className="w-60 flex flex-col -mt-3">
                <Button variant="ghost" onClick={() => setStep({ kind: "local-calendar" })}>
                  Local-only calendar
                </Button>
              </div>
            )}
          </>
        )}

        {step.kind === "setup" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect {getProviderDisplayName(step.provider)}</DialogTitle>
              <DialogDescription>{step.instructions}</DialogDescription>
            </DialogHeader>

            <Button
              onClick={() =>
                setStep({ kind: "credentials", provider: step.provider, fields: step.fields })
              }
            >
              Continue
            </Button>
          </>
        )}

        {step.kind === "credentials" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect {getProviderDisplayName(step.provider)}</DialogTitle>
            </DialogHeader>

            <CredentialsForm step={step} onClose={onClose} />
          </>
        )}

        {step.kind === "local-calendar" && (
          <>
            <DialogHeader>
              <DialogTitle className="text-center">New local-only calendar</DialogTitle>
              <DialogDescription className="mt-2">
                This calendar will live on your computer only, and never be connected to the
                internet.
              </DialogDescription>
            </DialogHeader>

            <LocalCalendarForm onClose={onClose} />
          </>
        )}
      </div>
    </Modal>
  )
}
