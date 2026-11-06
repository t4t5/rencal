import { View } from "nsh"

import type { Vars } from "@/themes"

// A shortened month whose last two columns are the weekend; today is selected, as on launch.
const MINICAL_WEEKS = [0, 1, 2, 3]
const MINICAL_DAYS = [0, 1, 2, 3, 4]
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6]
const TODAY = { week: 1, day: 1 }

const isOutsideDay = (week: number, day: number) =>
  (week === 0 && day < 1) || (week === MINICAL_WEEKS.length - 1 && day > 2)
const isMinicalWeekend = (day: number) => day >= MINICAL_DAYS.length - 2
const isWeekend = (day: number) => day >= 5

// Events in the theme's default calendar color, so `--primary` and `--event-*` overrides show.
const PREVIEW_EVENTS = [
  { day: 0, top: 20, height: 30 },
  { day: 1, top: 40, height: 35 },
  { day: 2, top: 10, height: 25 },
  { day: 2, top: 50, height: 30 },
]

/** A cropped window of a theme's minical and week view, painted from its palette. */
export function PreviewWindow(props: { palette: Vars }) {
  const c = (name: string) => props.palette[name]
  const eventColor = () => c("event-color") ?? c("primary")
  const eventFill = () =>
    c("event-background") ?? `color-mix(in srgb, ${eventColor()} 20%, ${c("background")})`

  return (
    <View class="flex-1 pl-4 pt-4" style={{ backgroundColor: c("card") }}>
      <View
        class="h-[140px] w-[260px] flex-row overflow-hidden rounded-tl-lg shadow-lg"
        style={{ backgroundColor: c("background") }}
      >
        <View
          class="w-[76px] shrink-0 gap-2.5 border-r pt-2.5"
          style={{ borderColor: c("border") }}
        >
          <View class="flex-row gap-1 px-2">
            <View class="h-1.5 w-6 rounded-[1px]" style={{ backgroundColor: c("foreground") }} />
            <View class="h-1.5 w-3.5 rounded-[1px]" style={{ backgroundColor: c("brand") }} />
          </View>
          <View class="px-1">
            {MINICAL_WEEKS.map((week) => (
              <View
                class="flex-row"
                style={{ backgroundColor: week === TODAY.week ? c("hover") : undefined }}
              >
                {MINICAL_DAYS.map((day) => (
                  <View
                    class="h-3 flex-1 items-center justify-center"
                    style={{ backgroundColor: isMinicalWeekend(day) ? c("weekend") : undefined }}
                  >
                    {week === TODAY.week && day === TODAY.day ? (
                      <View
                        class="size-3 items-center justify-center"
                        style={{
                          backgroundColor: c("today"),
                          borderRadius: Number.parseFloat(c("radius-circle") ?? "0"),
                        }}
                      >
                        <View class="size-1" style={{ backgroundColor: c("today-foreground") }} />
                      </View>
                    ) : (
                      <View
                        class="size-1"
                        style={{
                          backgroundColor: c("muted-foreground"),
                          opacity: isOutsideDay(week, day) ? 0.4 : 1,
                        }}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>

        <View class="flex-1">
          <View class="h-4 shrink-0 flex-row border-b" style={{ borderColor: c("border") }}>
            {WEEK_DAYS.map((day) => (
              <View
                class="flex-1 items-end justify-center border-r px-1"
                style={{
                  borderColor: c("border"),
                  backgroundColor:
                    day === TODAY.day ? c("selected") : isWeekend(day) ? c("weekend") : undefined,
                }}
              >
                <View
                  class="h-0.5 w-1.5"
                  style={{
                    backgroundColor: day === TODAY.day ? c("today") : c("muted-foreground"),
                  }}
                />
              </View>
            ))}
          </View>
          <View class="flex-1 flex-row">
            {WEEK_DAYS.map((day) => (
              <View
                class="flex-1 border-r"
                style={{
                  borderColor: c("border"),
                  backgroundColor: isWeekend(day) ? c("weekend") : undefined,
                }}
              >
                {PREVIEW_EVENTS.filter((event) => event.day === day).map((event) => (
                  <View
                    class="absolute inset-x-px overflow-hidden"
                    style={{
                      top: `${event.top}%`,
                      height: `${event.height}%`,
                      backgroundColor: eventFill(),
                    }}
                  >
                    <View
                      class="absolute inset-y-0 left-0 w-[2px]"
                      style={{ backgroundColor: eventColor() }}
                    />
                  </View>
                ))}
                {day === TODAY.day ? (
                  <View
                    class="absolute inset-x-0 top-[30%] h-px"
                    style={{ backgroundColor: c("today") }}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  )
}
