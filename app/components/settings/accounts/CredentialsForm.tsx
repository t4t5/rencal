import { signal, Text, View } from "nsh"

import { ErrorText } from "@/components/settings/SettingsContent"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { getErrorMessage, type ProviderField } from "@/lib/api"

import { connectWithCredentials, isConnecting, type ModalStep } from "./providers"

export function CredentialsForm(props: {
  step: Extract<ModalStep, { kind: "credentials" }>
  providerName: string
  onNextStep: (fields: ProviderField[]) => void
  onClose: () => void
}) {
  const error = signal<string | null>(null)
  const values = signal<Record<string, string>>({})

  async function submit() {
    error.set(null)
    if (props.step.fields.some((field) => field.required && !values()[field.id])) {
      error.set("Please fill in all required fields")
      return
    }
    try {
      const nextFields = await connectWithCredentials(
        props.step.provider,
        Object.entries(values()).map(([id, value]) => ({ id, value })),
      )
      if (nextFields) props.onNextStep(nextFields)
      else props.onClose()
    } catch (e) {
      error.set(getErrorMessage(e, "Failed to connect account"))
    }
  }

  return (
    <View class="w-full gap-3">
      <Each of={props.step.fields} key={(field) => field.id}>
        {(field) => (
          <View class="gap-1">
            <Input
              variant="default"
              masked={field().field_type === "password"}
              placeholder={field().label}
              value={values()[field().id] ?? ""}
              readonly={isConnecting()}
              onChange={({ value }) => values.update((all) => ({ ...all, [field().id]: value }))}
              onSubmit={() => void submit()}
            />
            <If when={field().help}>
              <Text class="text-xs text-muted-foreground">{field().help}</Text>
            </If>
          </View>
        )}
      </Each>
      <ErrorText message={error()} />
      <View class="mt-3 flex-row justify-end">
        <Button
          disabled={isConnecting()}
          label={isConnecting() ? "Connecting..." : `Connect ${props.providerName}`}
          onPress={() => void submit()}
        />
      </View>
    </View>
  )
}
