import { FormEvent, useEffect, useState } from "react"
import type { IconType } from "react-icons"
import { FaApple, FaGoogle, FaMicrosoft } from "react-icons/fa6"
import { IoArrowBack as BackIcon, IoCalendar as CalendarIcon } from "react-icons/io5"

import { Button } from "@/components/ui/button"
import { DialogDescription, DialogHeader, DialogTitle, Modal } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import { rpc } from "@/rpc"
import type { ProviderField } from "@/rpc/bindings"

import { useConnectProvider } from "@/hooks/useConnectProvider"

const providerToIcon: Record<string, IconType> = {
  google: FaGoogle,
  icloud: FaApple,
  outlook: FaMicrosoft,
}

type ModalStep =
  | { kind: "select-provider" }
  | { kind: "setup"; provider: string; instructions: string; fields: ProviderField[] }
  | { kind: "credentials"; provider: string; fields: ProviderField[] }

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ModalStep>({ kind: "select-provider" })
  const { connect, connectWithCredentials, isConnecting } = useConnectProvider()

  const [providers, setProviders] = useState<string[]>([])
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    rpc.caldir.list_providers().then(setProviders)
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

  function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <Modal onClose={onClose}>
      {step.kind === "select-provider" && (
        <>
          <DialogHeader>
            <DialogTitle>Add Calendar Account</DialogTitle>
            <DialogDescription>Choose a calendar provider to connect.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {providers.map((name) => {
              const Icon = providerToIcon[name] ?? CalendarIcon
              return (
                <Button
                  key={name}
                  variant="outline"
                  className="justify-start gap-3 h-12 border-input"
                  disabled={isConnecting}
                  onClick={() => handleProviderClick(name)}
                >
                  <Icon className="size-4" />
                  {capitalize(name)} Calendar
                </Button>
              )
            })}
          </div>
        </>
      )}

      {step.kind === "setup" && (
        <>
          <DialogHeader>
            <DialogTitle>Connect {capitalize(step.provider)} Calendar</DialogTitle>
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
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setStep({ kind: "select-provider" })}
              >
                <BackIcon className="size-4" />
              </Button>
              <DialogTitle>{capitalize(step.provider)} Credentials</DialogTitle>
            </div>
            <DialogDescription>
              Enter your credentials to connect your {capitalize(step.provider)} account.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-3">
            {step.fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-1">
                {field.field_type === "password" ? (
                  <div className="relative">
                    <Input
                      type={showPasswords[field.id] ? "text" : "password"}
                      placeholder={field.label}
                      value={fieldValues[field.id] ?? ""}
                      onChange={(e) =>
                        setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                      }
                      className="border-input pr-16"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setShowPasswords((prev) => ({
                          ...prev,
                          [field.id]: !prev[field.id],
                        }))
                      }
                    >
                      {showPasswords[field.id] ? "Hide" : "Show"}
                    </button>
                  </div>
                ) : (
                  <Input
                    type="text"
                    placeholder={field.label}
                    value={fieldValues[field.id] ?? ""}
                    onChange={(e) =>
                      setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                    }
                    className="border-input"
                  />
                )}
                {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
              </div>
            ))}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? "Connecting..." : `Connect ${capitalize(step.provider)} Account`}
            </Button>
          </form>
        </>
      )}
    </Modal>
  )
}
