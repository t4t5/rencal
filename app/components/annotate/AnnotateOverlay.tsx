import { cleanup, computed, keymap, Overlay, signal, Text, View, windowSize } from "nsh"

import { ShortcutKeys } from "@/components/shortcuts/ShortcutKeys"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { POPUP_SURFACE } from "@/components/ui/popover"

import { dayAt, type Rect } from "@/lib/day-hits"
import { formatLongDate } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import {
  addPin,
  annotateKey,
  annotateSaving,
  annotating,
  editingPin,
  editPin,
  escapeAnnotate,
  finishPin,
  type Pin,
  pins,
  regionsUnder,
  saveAnnotations,
  stopAnnotate,
} from "@/stores/annotate"

const KEY = "mod+shift+a"
const EDITOR_WIDTH = 288
const PIN_SIZE = 22

type Target = { label: string; rect: Rect }

/** The innermost thing under the pointer: a day, else a registered region. */
function targetAt(x: number, y: number): Target | null {
  const area = dayAt(x, y)
  if (area) return { label: formatLongDate(area.day), rect: area.visible ?? area.rect }
  const region = regionsUnder(x, y)[0]
  return region ? { label: region.name, rect: region.rect } : null
}

function Highlight(props: { target: () => Target }) {
  const rect = () => props.target().rect
  return (
    <View
      class="absolute border-2 border-primary bg-primary/10"
      style={{ ...position(rect()), pointerEvents: "none" }}
    >
      <View class="absolute top-0 left-0 bg-primary px-1.5 py-0.5">
        <Text class="text-2xs font-mono text-primary-foreground">{props.target().label}</Text>
      </View>
    </View>
  )
}

const position = (rect: Rect) => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
})

function PinMarker(props: { pin: () => Pin; index: () => number }) {
  return (
    <View
      role="button"
      accessibilityLabel={`Note ${props.index() + 1}`}
      onPress={() => editPin(props.pin().id)}
      class="absolute items-center justify-center rounded-full border-2 border-background bg-primary shadow-md"
      style={{
        left: props.pin().x - PIN_SIZE / 2,
        top: props.pin().y - PIN_SIZE / 2,
        width: PIN_SIZE,
        height: PIN_SIZE,
        cursor: "pointer",
      }}
    >
      <Text class="text-2xs font-mono font-bold text-primary-foreground">{props.index() + 1}</Text>
    </View>
  )
}

function NoteEditor(props: { pin: () => Pin; index: () => number }) {
  const text = signal(props.pin().note)
  const left = () =>
    Math.max(8, Math.min(props.pin().x + PIN_SIZE, windowSize().width - EDITOR_WIDTH - 8))
  const top = () => Math.max(8, Math.min(props.pin().y - 12, windowSize().height - 220))
  const finish = () => finishPin(props.pin().id, text())
  return (
    <View
      class={cn(POPUP_SURFACE, "absolute gap-2 p-3")}
      style={{ left: left(), top: top(), width: EDITOR_WIDTH }}
    >
      <Text class="text-xs font-semibold text-foreground">Note {props.index() + 1}</Text>
      <Each of={props.pin().context}>
        {(line) => <Text class="text-2xs text-muted-foreground line-clamp-2">{line()}</Text>}
      </Each>
      <Input
        autoFocus
        variant="default"
        value={text()}
        onChange={(event) => text.set(event.value)}
        onSubmit={finish}
        placeholder="What should change?"
        accessibilityLabel="Note"
      />
      <View class="flex-row justify-end gap-2">
        <Button
          variant="ghost"
          size="xs"
          label="Remove"
          onPress={() => finishPin(props.pin().id, "")}
        />
        <Button size="xs" label="Done" onPress={finish} />
      </View>
    </View>
  )
}

function Bar() {
  const count = () => pins().filter((pin) => pin.note).length
  return (
    <View
      class="absolute bottom-4 left-0 right-0 items-center"
      style={{ pointerEvents: "box-none" }}
    >
      <View class={cn(POPUP_SURFACE, "flex-row items-center gap-3 px-3 py-2")}>
        <Text class="text-xs text-foreground">
          {count() === 0
            ? "Click anything to pin a note"
            : `${count()} note${count() === 1 ? "" : "s"}`}
        </Text>
        <ShortcutKeys keys={KEY} />
        <Button variant="ghost" size="xs" label="Discard" onPress={stopAnnotate} />
        <Button
          size="xs"
          label={annotateSaving() ? "Saving…" : "Save"}
          disabled={count() === 0 || annotateSaving()}
          onPress={() => void saveAnnotations()}
        />
      </View>
    </View>
  )
}

/** Annotate mode: pins with notes over the whole window (`stores/annotate.ts`). */
export function AnnotateOverlay() {
  const pointer = signal<{ x: number; y: number } | null>(null)
  const target = computed(() => {
    const point = pointer()
    return point && !editingPin() && !annotateSaving() ? targetAt(point.x, point.y) : null
  })
  const editors = computed(() => {
    const pin = editingPin()
    return pin ? [pin] : []
  })
  const indexOf = (pin: Pin) => pins().findIndex((other) => other.id === pin.id)

  cleanup(keymap.bind(KEY, annotateKey, { when: "always" }))

  return (
    <If when={annotating()}>
      <Overlay class="inset-0" onCancel={escapeAnnotate}>
        <View
          testID="annotate-layer"
          class="absolute inset-0"
          style={{ cursor: "crosshair" }}
          onMouseMove={(event) => pointer.set(event.pagePosition)}
          onMouseLeave={() => pointer.set(null)}
          onPress={(event) => {
            if (editingPin()) return escapeAnnotate()
            addPin(event.pagePosition.x, event.pagePosition.y)
          }}
        />
        <If when={target()}>{(t) => <Highlight target={t} />}</If>
        <If when={!annotateSaving()}>
          <Bar />
        </If>
        <Each of={pins()} key={(pin) => pin.id}>
          {(pin) => <PinMarker pin={pin} index={() => indexOf(pin())} />}
        </Each>
        <Each of={editors()} key={(pin) => pin.id}>
          {(pin) => <NoteEditor pin={pin} index={() => indexOf(pin())} />}
        </Each>
      </Overlay>
    </If>
  )
}
