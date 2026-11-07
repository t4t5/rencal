import { cleanup, createMotion, LayoutAnimation, View, type ViewRef } from "nsh"

import { ComposeEventInner } from "@/components/event-parts/ComposeEvent"

import { inspectable } from "@/lib/inspect"

import { isDrafting, draftText, stopDrafting } from "@/stores/draft"

import { bindFlightCard, isFlying, startFlight } from "./FlyAnimation"
import { SidebarToolbar } from "./SidebarToolbar"

function DraftCard() {
  let card: ViewRef | undefined
  const motion = createMotion()
  cleanup(bindFlightCard(() => card, motion))

  return (
    <View class="relative z-20 pt-4">
      <View ref={card} class="rounded-(--radius-xl) bg-card" style={motion.style}>
        <ComposeEventInner
          onBeforeCreate={startFlight}
          onCreated={() => {
            LayoutAnimation.easeInEaseOut()
            stopDrafting()
          }}
        />
      </View>
    </View>
  )
}

/** The compose button, and under it the draft card once something's been typed. */
export function SidebarHeader() {
  const showDraft = () => (isDrafting() && draftText().length > 0) || isFlying()
  return (
    <View
      ref={inspectable("Sidebar header", "components/sidebar/header/SidebarHeader.tsx")}
      class="relative z-20 p-(--layout-padding) pb-0"
    >
      <SidebarToolbar />
      <If when={showDraft()}>
        <DraftCard />
      </If>
    </View>
  )
}
