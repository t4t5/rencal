import { cleanup, context, effect, type JSX, Text, View, type ViewRef } from "nsh"
import { Button as BaseButton, Dialog as BaseDialog } from "nsh/base"
import { currentWindow } from "nsh/desktop"

import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons"
import { noteMainDialogOpen } from "@/stores/dialogs"
import { typography } from "@/themes"

type FocusClaim = () => ViewRef | undefined

/** Where a `Button` with `autoFocus` asks its dialog for the focus. */
export const DialogFocus = context<((claim: FocusClaim) => () => void) | null>(null)

/** A centered modal: pressing the backdrop or Escape closes it. */
export function Dialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  class?: string
  showCloseButton?: boolean
  children?: JSX.Element
}) {
  const win = currentWindow()
  effect(() => {
    if (win.main && props.open) cleanup(noteMainDialogOpen())
  })

  // NSH's dialogs take the focus from what's under them but give it to nothing;
  // a ref's focus() misses on Linux until the dialog has appeared.
  const claims: FocusClaim[] = []
  const claim = (ref: FocusClaim) => {
    claims.push(ref)
    return () => void claims.splice(claims.indexOf(ref), 1)
  }

  return (
    <BaseDialog
      open={props.open}
      onOpenChange={(event) => props.onOpenChange(event.open)}
      onOpen={() => claims[0]?.()?.focus()}
      animation="fade"
      backdropClass="bg-overlay"
      class={cn(
        "m-auto w-[512px] max-w-full gap-4 rounded-(--radius-lg) border border-border bg-background p-6 text-foreground shadow-lg",
        props.class,
      )}
    >
      <If when={props.showCloseButton ?? true}>
        <BaseButton
          onPress={() => props.onOpenChange(false)}
          accessibilityLabel="Close"
          class="absolute right-1 top-1 p-1 opacity-70 hover:opacity-100"
        >
          <CloseIcon class="size-4" />
        </BaseButton>
      </If>
      <DialogFocus.Provider value={claim}>{props.children}</DialogFocus.Provider>
    </BaseDialog>
  )
}

export function DialogHeader(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("gap-2", props.class)}>{props.children}</View>
}

export function DialogFooter(props: { class?: string; children?: JSX.Element }) {
  return <View class={cn("flex-row justify-end gap-2", props.class)}>{props.children}</View>
}

export function DialogTitle(props: { class?: string; children?: JSX.Element }) {
  return (
    <Text class={cn(typography.title(), "text-center font-semibold", props.class)}>
      {props.children}
    </Text>
  )
}

export function DialogDescription(props: { class?: string; children?: JSX.Element }) {
  return (
    <Text class={cn(typography.body(), "text-muted-foreground", props.class)}>
      {props.children}
    </Text>
  )
}
