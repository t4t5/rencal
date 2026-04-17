import { useState } from "react"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"

import type { ProviderField } from "@/rpc/bindings"

import { getProviderDisplayName } from "@/lib/providers"

import { CredentialsForm } from "./CredentialsForm"
import { ProviderList } from "./ProviderList"

export type ModalStep =
  | { kind: "select-provider" }
  | { kind: "setup"; provider: string; instructions: string; fields: ProviderField[] }
  | { kind: "credentials"; provider: string; fields: ProviderField[] }

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ModalStep>({ kind: "select-provider" })

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-6">
        {step.kind === "select-provider" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Account</DialogTitle>
            </DialogHeader>

            <ProviderList onClose={onClose} onSetStep={setStep} />
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
      </div>
    </Modal>
  )
}
