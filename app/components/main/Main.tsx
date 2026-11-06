import { View } from "nsh"

import { calendarView } from "@/stores/view"
import { VIEWS } from "@/views/manifest"

import { MainHeader } from "./MainHeader"

export function Main() {
  return (
    <View class="flex-1 min-w-0">
      <MainHeader />
      <Each of={VIEWS} key={(view) => view.id}>
        {(view) => (
          <If when={calendarView() === view().id}>
            <View class="flex-1 min-h-0">{view().component()}</View>
          </If>
        )}
      </Each>
    </View>
  )
}
