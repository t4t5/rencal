import { Overlay, Text, View } from "nsh"

import { formatTime, isAllDay } from "@/lib/event-time"
import { cn } from "@/lib/utils"

import { activeDrag, type ActiveEventDrag, dragPointer, type DragFloat } from "@/stores/drag"
import { timeFormat } from "@/stores/settings"
import { paintOf, UNTITLED } from "@/views/event-block"

function floatPosition(float: DragFloat, x: number, y: number) {
  if (float.kind === "block") {
    return {
      left: x - float.offsetX,
      top: y - float.offsetY,
      width: float.width,
      height: float.height,
    }
  }
  return { left: x - 12, top: y - 10 }
}

function FloatCard(props: { drag: () => ActiveEventDrag; float: () => DragFloat }) {
  const event = () => props.drag().event
  const range = () => props.drag().target ?? event()
  const paint = () => paintOf(event())
  const block = () => props.float().kind === "block"
  return (
    <View
      testID="drag-float"
      class={cn(
        "absolute overflow-hidden rounded-(--radius-xs) shadow-xl",
        block() ? "px-1.5 py-1" : "px-1.5 py-0.5",
      )}
      style={{
        ...floatPosition(props.float(), dragPointer().x, dragPointer().y),
        backgroundColor: paint().selectedFill,
      }}
    >
      <Text
        class="text-xs font-medium leading-tight truncate"
        style={{ color: paint().foreground }}
      >
        {event().summary || UNTITLED}
      </Text>
      <If when={block() && !isAllDay(range().start)}>
        <Text class="text-xs text-muted-foreground leading-tight truncate">
          {formatTime(range().start, timeFormat())} – {formatTime(range().end, timeFormat())}
        </Text>
      </If>
    </View>
  )
}

/** The copy of the dragged event that follows the pointer. */
export function EventDragOverlay() {
  return (
    <If when={activeDrag()}>
      {(drag) => (
        <Overlay class="inset-0" style={{ pointerEvents: "none", cursor: "grabbing" }}>
          <If when={drag().float}>{(float) => <FloatCard drag={drag} float={float} />}</If>
        </Overlay>
      )}
    </If>
  )
}
