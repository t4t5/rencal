import { signal, Text, View, type ViewRef } from "nsh"
import { HoverCard } from "nsh/base"

import { POPUP_SURFACE } from "@/components/ui/popover"

import type { CalendarEvent } from "@/lib/cal-events"
import { eventKey } from "@/lib/cal-events"
import { formatTime } from "@/lib/event-time"
import { isSpanning } from "@/lib/event-utils"
import { type AllDayBar } from "@/lib/layout"
import { cn, FOCUS_RING } from "@/lib/utils"

import { dragRole, eventDragHandlers, selectionColor } from "@/stores/drag"
import { timeFormat } from "@/stores/settings"
import {
  blockStyle,
  isDeclined,
  isDraftEvent,
  isSelected,
  isTentative,
  openEventMenu,
  paintOf,
  pressBlock,
  UNTITLED,
} from "@/views/event-block"

import { LANE_GAP, LANE_HEIGHT, type Spanning } from "./layout"

// Past this, the "+n more" list summarises the rest instead of growing off-screen.
const MAX_LIST_ROWS = 12

const BAR_OVERHANG = 2

function TimedContent(props: { event: () => CalendarEvent }) {
  const paint = () => paintOf(props.event())
  return (
    <>
      <View class="w-0.5 self-stretch shrink-0" style={{ backgroundColor: paint().color }} />
      <Text
        class={cn("text-xs flex-1 line-clamp-1", isDeclined(props.event()) && "line-through")}
        style={dragRole(props.event()) === "preview" ? { color: paint().foreground } : undefined}
      >
        <Text
          class="font-mono text-2xs"
          style={{ color: isSelected(props.event()) ? undefined : paint().tinted }}
        >
          {formatTime(props.event().start, timeFormat())}
        </Text>{" "}
        {props.event().summary || UNTITLED}
      </Text>
    </>
  )
}

export function TimedEvent(props: { event: () => CalendarEvent }) {
  let block: ViewRef | undefined
  const role = () => dragRole(props.event())
  return (
    <View
      ref={block}
      role="button"
      testID={role() === "preview" ? "drag-preview" : `event:${props.event().summary}`}
      onPress={(press) => pressBlock(props.event(), block, press)}
      onContextMenu={(menu) => openEventMenu(props.event(), block, menu)}
      {...eventDragHandlers({ event: props.event, kind: "pill", block: () => block })}
      class={cn(
        "flex-row gap-1 shrink-0 rounded-(--radius-xs) pr-1",
        FOCUS_RING,
        isSelected(props.event()) ? "bg-selected text-selected-foreground" : "hover:bg-hover",
        isTentative(props.event()) && "opacity-50",
        role() === "source" && "opacity-40",
      )}
      style={
        role() === "preview" || isDraftEvent(props.event()) ? blockStyle(props.event()) : undefined
      }
    >
      <TimedContent event={props.event} />
    </View>
  )
}

/** Left and right edges of a bar, from `column` of a row `width` wide. */
function barEdges(bar: AllDayBar<unknown>, width: number, inset: number) {
  const day = width / 7
  const left = bar.column * day + (bar.isStart ? inset : -BAR_OVERHANG)
  const right = (bar.column + bar.span) * day - (bar.isEnd ? inset : -BAR_OVERHANG)
  return { left, width: right - left }
}

export function AllDayBarView(props: {
  bar: () => AllDayBar<Spanning>
  width: () => number
  inset: number
}) {
  let block: ViewRef | undefined
  const event = () => props.bar().item.event
  const paint = () => paintOf(event())
  const role = () => dragRole(event())
  return (
    <View
      ref={block}
      role="button"
      testID={role() === "preview" ? "drag-preview" : `event:${event().summary}`}
      onPress={(press) => pressBlock(event(), block, press)}
      onContextMenu={(menu) => openEventMenu(event(), block, menu)}
      {...eventDragHandlers({ event, kind: "pill", block: () => block })}
      class={cn(
        "absolute px-(--event-padding-inline) justify-center overflow-hidden",
        FOCUS_RING,
        props.bar().isStart && "rounded-l-(--radius-xs)",
        props.bar().isEnd && "rounded-r-(--radius-xs)",
        isTentative(event()) && "opacity-50",
        role() === "source" && "opacity-40",
      )}
      style={{
        ...barEdges(props.bar(), props.width(), props.inset),
        top: LANE_HEIGHT * props.bar().lane,
        height: LANE_HEIGHT - LANE_GAP,
        ...blockStyle(event()),
      }}
    >
      <Text
        class={cn("text-xs line-clamp-1", isDeclined(event()) && "line-through")}
        style={{ color: paint().foreground }}
      >
        {event().summary || UNTITLED}
      </Text>
    </View>
  )
}

/** The range being drawn, where its bar will land. */
export function SelectionBar(props: {
  bar: () => AllDayBar<unknown>
  width: () => number
  inset: number
}) {
  return (
    <View
      testID="create-selection"
      class={cn(
        "absolute",
        props.bar().isStart && "rounded-l-(--radius-xs)",
        props.bar().isEnd && "rounded-r-(--radius-xs)",
      )}
      style={{
        ...barEdges(props.bar(), props.width(), props.inset),
        top: LANE_HEIGHT * props.bar().lane,
        height: LANE_HEIGHT - LANE_GAP,
        backgroundColor: selectionColor(),
        pointerEvents: "none",
      }}
    />
  )
}

/** A row of the "+n more" list. */
function HiddenEventRow(props: { event: () => CalendarEvent; onOpen: () => void }) {
  let block: ViewRef | undefined
  const spanning = () => isSpanning(props.event())
  return (
    <View
      ref={block}
      role="button"
      onPress={(press) => {
        pressBlock(props.event(), block, press)
        props.onOpen()
      }}
      class={cn(
        "flex-row gap-1 shrink-0 rounded-(--radius-xs)",
        FOCUS_RING,
        spanning() ? "px-1 py-px" : "pr-1 hover:bg-hover",
      )}
      style={spanning() ? { backgroundColor: paintOf(props.event()).fill } : undefined}
    >
      <If when={spanning()} else={<TimedContent event={props.event} />}>
        <Text class="text-xs line-clamp-1" style={{ color: paintOf(props.event()).foreground }}>
          {props.event().summary || UNTITLED}
        </Text>
      </If>
    </View>
  )
}

/** "+n more", whose card lists what didn't fit in the cell. */
export function HiddenEvents(props: { events: () => CalendarEvent[] }) {
  const open = signal(false)
  const rows = () => {
    const events = props.events()
    return events.length > MAX_LIST_ROWS ? events.slice(0, MAX_LIST_ROWS - 1) : events
  }
  const rest = () => props.events().length - rows().length
  return (
    <HoverCard
      open={open()}
      onOpenChange={(change) => open.set(change.open)}
      openDelay={300}
      closeDelay={150}
      placement="right"
      align="start"
      offset={4}
      margin={8}
      popupClass={cn(POPUP_SURFACE, "w-64 gap-1 p-1.5")}
      trigger={
        <Text class="text-xs text-muted-foreground hover:text-foreground px-0.5 line-clamp-1 self-start shrink-0">
          +{props.events().length} more
        </Text>
      }
    >
      <Each of={rows()} key={eventKey}>
        {(event) => <HiddenEventRow event={event} onOpen={() => open.set(false)} />}
      </Each>
      <If when={rest() > 0}>
        <Text class="text-2xs text-muted-foreground px-1.5">and {rest()} more</Text>
      </If>
    </HoverCard>
  )
}
