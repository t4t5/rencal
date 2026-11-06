import { signal, View } from "nsh"

import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { findProvider, getProviderDisplayName } from "@/lib/providers"

import { CredentialsForm } from "./CredentialsForm"
import { LocalCalendarForm } from "./LocalCalendarForm"
import { ProviderList } from "./ProviderList"
import { loadProviders, type ModalStep, providers } from "./providers"

export function AddAccountModal(props: {
  onClose: () => void
  showLocalOnlyOption?: boolean
  initialStep?: ModalStep
}) {
  const step = signal<ModalStep>(props.initialStep ?? { kind: "select-provider" })
  const providerName = (slug: string) =>
    getProviderDisplayName(slug, findProvider(providers(), slug))

  void loadProviders()

  const setup = () => {
    const current = step()
    return current.kind === "setup" ? current : null
  }
  // A list of one, so a follow-up form (a 2FA code) starts with empty values.
  const credentials = () => {
    const current = step()
    return current.kind === "credentials" ? [current] : []
  }

  return (
    <Dialog
      open
      class="w-[425px]"
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <If when={step().kind === "select-provider"}>
        <DialogHeader>
          <DialogTitle>Connect calendar</DialogTitle>
        </DialogHeader>
        <View class="items-center gap-3">
          <ProviderList onClose={props.onClose} onSetStep={(next) => step.set(next)} />
          <If when={props.showLocalOnlyOption}>
            <View class="w-60">
              <Button
                variant="ghost"
                label="Local-only calendar"
                onPress={() => step.set({ kind: "local-calendar" })}
              />
            </View>
          </If>
        </View>
      </If>

      <If when={setup()}>
        {(current) => (
          <>
            <DialogHeader>
              <DialogTitle>Connect {providerName(current().provider)}</DialogTitle>
              <DialogDescription>{current().instructions}</DialogDescription>
            </DialogHeader>
            <Button
              class="self-center"
              label="Continue"
              onPress={() =>
                step.set({
                  kind: "credentials",
                  provider: current().provider,
                  fields: current().fields,
                })
              }
            />
          </>
        )}
      </If>

      <Each of={credentials()} key={(current) => current.fields.map((f) => f.id).join()}>
        {(current) => (
          <>
            <DialogHeader>
              <DialogTitle>Connect {providerName(current().provider)}</DialogTitle>
            </DialogHeader>
            <CredentialsForm
              step={current()}
              providerName={providerName(current().provider)}
              onNextStep={(fields) =>
                step.set({ kind: "credentials", provider: current().provider, fields })
              }
              onClose={props.onClose}
            />
          </>
        )}
      </Each>

      <If when={step().kind === "local-calendar"}>
        <LocalCalendarForm onClose={props.onClose} />
      </If>
    </Dialog>
  )
}
