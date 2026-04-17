import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

import { useConnectProvider } from "@/hooks/useConnectProvider"
import { getProviderDisplayName } from "@/lib/providers"

import { ModalStep } from "./AddAccountModal"

export const CredentialsForm = ({
  step,
  onClose,
}: {
  step: Extract<ModalStep, { kind: "credentials" }>
  onClose: () => void
}) => {
  const [error, setError] = useState<string | null>(null)
  const { connectWithCredentials, isConnecting } = useConnectProvider()

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})

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
    <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-3 w-full">
      {step.fields.map((field) => (
        <div key={field.id} className="flex flex-col gap-1">
          {field.field_type === "password" ? (
            <PasswordInput
              ghost={false}
              placeholder={field.label}
              value={fieldValues[field.id] ?? ""}
              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            />
          ) : (
            <Input
              ghost={false}
              type="text"
              placeholder={field.label}
              value={fieldValues[field.id] ?? ""}
              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
            />
          )}
          {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={isConnecting} className="mt-3">
          {isConnecting ? "Connecting..." : `Connect ${getProviderDisplayName(step.provider)}`}
        </Button>
      </div>
    </form>
  )
}
