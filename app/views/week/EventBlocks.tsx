import { Text, View, type ViewRef } from "nsh"

import { Tooltip } from "@/components/ui/tooltip"

import { DAY_MINUTES, formatTime } from "@/lib/event-time"
import { type AllDayBar, type TimedBlock } from "@/lib/layout"
import { cn, FOCUS_RING } from "@/lib/utils"

import { activeDrag, dragRole, eventDragHandlers } from "@/stores/drag"
import { timeFormat } from "@/stores/settings"
import {
  blockStyle,
  isDeclined,
  isDraftEvent,
  isTentative,
  openEventMenu,
  paintOf,
  pressBlock,
  UNTITLED,
} from "@/views/event-block"
import type { Spanning } from "@/views/month/layout"

import { eventBox } from "./grid"
import type { TimedItem } from "./layout"

const PADDING = 6
const STRIPE = 4

export const LANE_HEIGHT = 20

type DisplayMode = "xs" | "sm" | "md" | "lg"

// Thresholds are the shortest durations whose block fits each mode's lines at 48px per hour.
function displayModeFor({ startMinutes, endMinutes }: TimedItem): DisplayMode {
  // An event ending at midnight ends at the bottom of its day.
  const minutes = Math.min(endMinutes, DAY_MINUTES) - startMinutes
  if (minutes < 45) return "xs"
  if (minutes < 60) return "sm"
  if (minutes < 75) return "md"
  return "lg"
}

export function TimedEventBlock(props: {
  block: () => TimedBlock<TimedItem>
  dayWidth: () => number
}) {
  let block: ViewRef | undefined
  const event = () => props.block().item.event
  const mode = () => displayModeFor(props.block().item)
  const box = () => eventBox(props.block(), props.dayWidth())
  const paint = () => paintOf(event())
  const role = () => dragRole(event())
  const stripe = () => !isTentative(event()) && !isDraftEvent(event())
  const start = () => formatTime(event().start, timeFormat())
  const end = () => formatTime(event().end, timeFormat())
  const separator = () => (mode() === "sm" ? "-" : "–")
  const summary = () => event().summary || UNTITLED

  return (
    <View
      ref={block}
      role="button"
      testID={role() === "preview" ? "drag-preview" : `event:${event().summary}`}
      tooltip={
        event().id && !activeDrag() ? (
          <Tooltip
            placement="right"
            delay={500}
            label={[summary(), `${start()} – ${end()}`, event().location]
              .filter(Boolean)
              .join("\n")}
          />
        ) : undefined
      }
      onPress={(press) => pressBlock(event(), block, press)}
      onContextMenu={(menu) => openEventMenu(event(), block, menu)}
      {...eventDragHandlers({ event, kind: "block", block: () => block })}
      class={cn(
        "absolute overflow-hidden rounded-(--radius-sm) ring-1 ring-background",
        FOCUS_RING,
        mode() === "xs" && "flex-row items-baseline gap-1 pt-px",
        mode() === "sm" && "pt-0.5",
        (mode() === "md" || mode() === "lg") && "py-1",
        isTentative(event()) && "opacity-50",
        role() === "source" && "opacity-40",
      )}
      style={{
        top: box().top,
        height: box().height,
        left: box().left,
        width: box().width,
        paddingLeft: PADDING + (stripe() ? STRIPE : 0),
        paddingRight: PADDING + box().coveredWidth,
        ...blockStyle(event()),
        zIndex: role() === "preview" ? 10 : undefined,
      }}
    >
      <If when={stripe()}>
        <View
          class="absolute left-0 top-0 bottom-0 w-1"
          style={{ backgroundColor: paint().color }}
        />
      </If>
      <Text
        class={cn(
          "text-xs font-medium leading-tight",
          (mode() === "xs" || mode() === "sm") && "truncate",
          mode() === "xs" && "min-w-0 flex-1",
          mode() === "lg" && "line-clamp-2",
          isDeclined(event()) && "line-through",
        )}
        style={{ color: paint().foreground }}
      >
        {summary()}
      </Text>
      <Text
        class={cn(
          "leading-tight opacity-70",
          mode() === "xs" ? "text-2xs shrink-0" : "text-xs truncate",
        )}
        style={{ color: paint().foreground }}
      >
        {mode() === "xs" ? start() : `${start()} ${separator()} ${end()}`}
      </Text>
    </View>
  )
}

export function AllDayBarBlock(props: {
  bar: () => AllDayBar<Spanning>
  left: () => number
  width: () => number
}) {
  let block: ViewRef | undefined
  const event = () => props.bar().item.event
  const paint = () => paintOf(event())
  const role = () => dragRole(event())

  return (
    <View
      class="absolute justify-center"
      style={{
        left: props.left(),
        width: props.width(),
        top: props.bar().lane * LANE_HEIGHT,
        height: LANE_HEIGHT,
        paddingLeft: 2,
        paddingRight: 3,
        pointerEvents: "box-none",
      }}
    >
      <View
        ref={block}
        role="button"
        testID={role() === "preview" ? "drag-preview" : `event:${event().summary}`}
        onPress={(press) => pressBlock(event(), block, press)}
        onContextMenu={(menu) => openEventMenu(event(), block, menu)}
        {...eventDragHandlers({ event, kind: "pill", block: () => block })}
        class={cn(
          "justify-center px-(--event-padding-inline) py-px rounded-(--radius-xs) overflow-hidden",
          FOCUS_RING,
          isTentative(event()) && "opacity-50",
          role() === "source" && "opacity-40",
        )}
        style={blockStyle(event())}
      >
        <Text
          class={cn("text-xs leading-4 truncate", isDeclined(event()) && "line-through")}
          style={{ color: paint().foreground }}
        >
          {event().summary || UNTITLED}
        </Text>
      </View>
    </View>
  )
}
