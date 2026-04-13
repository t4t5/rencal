import { FormEvent, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

import { rpc } from "@/rpc"
import type { ProviderField } from "@/rpc/bindings"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getProviderDisplayName, getProviderIcon, providerRequiresAccount } from "@/lib/providers"

type ModalStep =
  | { kind: "select-provider" }
  | { kind: "setup"; provider: string; instructions: string; fields: ProviderField[] }
  | { kind: "credentials"; provider: string; fields: ProviderField[] }

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ModalStep>({ kind: "select-provider" })
  const { connect, connectWithCredentials, isConnecting } = useConnectProvider()

  const [providers, setProviders] = useState<string[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rpc.caldir.list_providers().then((all) => setProviders(all.filter(providerRequiresAccount)))
  }, [])

  async function handleProviderClick(name: string) {
    setError(null)
    const info = await rpc.caldir.get_provider_connect_info(name)

    if (info.step === "oauth_redirect" || info.step === "hosted_oauth") {
      await connect(name)
      onClose()
    } else if (info.step === "needs_setup") {
      setStep({
        kind: "setup",
        provider: name,
        instructions: info.instructions ?? "",
        fields: info.fields,
      })
    } else if (info.step === "credentials") {
      setStep({ kind: "credentials", provider: name, fields: info.fields })
    }
  }

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (step.kind !== "credentials") return

    const missingRequired = step.fields.filter((f) => f.required).some((f) => !fieldValues[f.id])

    if (missingRequired) {
      setError("Please fill in all required fields")
      return
    }

    try {
      await connectWithCredentials(
        step.provider,
        Object.entries(fieldValues).map(([id, value]) => ({ id, value })),
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect account")
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex flex-col items-center gap-6">
        {step.kind === "select-provider" && (
          <>
            <DialogHeader>
              <DialogTitle>Connect Account</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-3 w-60">
              {providers.map((name) => {
                const Icon = getProviderIcon(name)
                const displayName = getProviderDisplayName(name)

                return (
                  <Button
                    key={name}
                    variant="secondary"
                    className="gap-3 h-12 border-input"
                    disabled={isConnecting}
                    onClick={() => handleProviderClick(name)}
                  >
                    <Icon className="size-4" />
                    {displayName}
                  </Button>
                )
              })}
            </div>
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

            <form
              onSubmit={handleCredentialsSubmit}
              noValidate
              className="flex flex-col gap-3 w-full"
            >
              {step.fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-1">
                  {field.field_type === "password" ? (
                    <PasswordInput
                      ghost={false}
                      placeholder={field.label}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  ) : (
                    <Input
                      ghost={false}
                      type="text"
                      placeholder={field.label}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                    />
                  )}
                  {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
                </div>
              ))}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex justify-end">
                <Button type="submit" disabled={isConnecting} className="mt-3">
                  {isConnecting
                    ? "Connecting..."
                    : `Connect ${getProviderDisplayName(step.provider)}`}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  )
}
