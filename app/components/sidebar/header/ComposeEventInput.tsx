import {
  effect,
  type InputRef,
  keymap,
  Overlay,
  signal,
  Text,
  token,
  untracked,
  View,
  type ViewRef,
} from "nsh"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { dateInViewerZone } from "@/lib/event-time"
import { segmentEventText } from "@/lib/magic-parser"
import { cn } from "@/lib/utils"

import { CloseIcon } from "@/icons"
import { navigateToDate } from "@/stores/calendar"
import { createDraftEvent, draftEvent, draftText, isDrafting, setDraftText } from "@/stores/draft"

import { flyingText, isFlying, startFlight } from "./FlyAnimation"

/*
 * Magic segments ("tomorrow at 7pm", "in London") get a dashed outline. The web
 * version measured them with a hidden mirror; here the mirror is the outline: the
 * same text in a row over the input, invisible, its parsed spans outlined.
 */
function MagicSegments(props: { text: string; caretIndex: number; caretX: number }) {
  const segments = () => segmentEventText(props.text)
  // The input doesn't report its scroll: it's how far the caret sits from where
  // its text would put it.
  const beforeCaret = signal(0)
  const scrolled = () => Math.min(0, props.caretX - TEXT_INSET - beforeCaret())
  return (
    <View
      class="absolute inset-0 justify-center overflow-hidden whitespace-nowrap"
      style={{ pointerEvents: "none", paddingLeft: TEXT_INSET }}
    >
      <Text
        class="absolute text-sm text-transparent"
        onLayout={({ bounds }) => beforeCaret.set(bounds.size.width)}
      >
        {props.text.slice(0, props.caretIndex)}
      </Text>
      <View class="flex-row" style={{ transform: [{ translateX: scrolled() }] }}>
        <Each of={segments()}>
          {(segment) => (
            <View
              class={cn(
                segment().parsed &&
                  "rounded-(--radius-sm) outline-1 outline-dashed outline-muted-foreground/40 outline-offset-2",
              )}
            >
              <Text class="text-sm text-transparent">{segment().text}</Text>
            </View>
          )}
        </Each>
      </View>
    </View>
  )
}

const TEXT_INSET = 9

function useJumpToStartDate() {
  let previous: string | null = null
  effect(() => {
    if (!isDrafting()) {
      previous = null
      return
    }
    const date = dateInViewerZone(draftEvent().start)
    const key = date.toString()
    if (previous !== null && previous !== key) untracked(() => navigateToDate(date))
    previous = key
  })
}

/** Mounted only while drafting, so a collapsed field doesn't take Escape or presses. */
function ExitListeners(props: { field: ViewRef | undefined; onExit: () => void }) {
  // Once clears the text; again leaves compose mode.
  keymap.bind(
    "escape",
    () => {
      if (draftText()) setDraftText("")
      else props.onExit()
    },
    { when: "always" },
  )

  return (
    // Draws nothing: it's how to hear a press outside the field.
    <Overlay
      anchor={props.field}
      class="size-0"
      onPressOutside={() => {
        if (!draftText()) props.onExit()
      }}
    />
  )
}

/** Always mounted under the "+", and inert until drafting starts. */
export function ComposeEventInput(props: { onExit: () => void }) {
  let input: InputRef | undefined
  let field: ViewRef | undefined

  const shownText = () => (isFlying() ? flyingText() : draftText())
  const caretIndex = signal(0)
  const caretX = signal(TEXT_INSET)

  const create = () => {
    if (!draftText()) return
    startFlight(draftEvent().start)
    void createDraftEvent().then(props.onExit)
  }

  effect(() => {
    if (isDrafting()) input?.focus()
    else input?.blur()
  })

  useJumpToStartDate()

  return (
    <View ref={field} class="relative w-full">
      <If when={isDrafting()}>
        <ExitListeners field={field} onExit={props.onExit} />
      </If>
      <Input
        ref={input}
        readonly={!isDrafting()}
        focusable={isDrafting()}
        variant="default"
        placeholder={isDrafting() ? "Meeting at 3pm" : ""}
        value={shownText()}
        class={cn(shownText() && "pr-9")}
        submitBehavior="submit"
        onChange={({ value }) => setDraftText(value)}
        onSubmit={create}
        onSelectionChange={({ start }) => caretIndex.set(start)}
        onCaretMove={({ bounds }) => caretX.set(bounds.origin.x)}
      />
      <If when={shownText()}>
        <MagicSegments text={shownText()} caretIndex={caretIndex()} caretX={caretX()} />
      </If>
      <If when={isDrafting() && draftText()}>
        <View class="absolute bottom-0 right-1 top-0 justify-center">
          <Button
            variant="ghost"
            size="icon-xs"
            round
            onPress={() => {
              setDraftText("")
              input?.focus()
            }}
          >
            <CloseIcon class="size-3.5" color={token("muted-foreground")} />
          </Button>
        </View>
      </If>
    </View>
  )
}
