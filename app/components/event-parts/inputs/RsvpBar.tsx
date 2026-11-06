import { View } from "nsh"

import { Button } from "@/components/ui/button"

import type { ResponseStatus } from "@/lib/cal-events"

export function RsvpBar(props: { onRsvp: (response: ResponseStatus) => void }) {
  return (
    <View class="flex-row justify-between gap-1.5">
      <Button
        size="sm"
        variant="secondary"
        label="Maybe"
        onPress={() => props.onRsvp("tentative")}
      />
      <View class="flex-row gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          label="Decline"
          onPress={() => props.onRsvp("declined")}
        />
        <Button size="sm" label="Accept" onPress={() => props.onRsvp("accepted")} />
      </View>
    </View>
  )
}
