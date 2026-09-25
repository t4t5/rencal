import { useMemo } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"

import { useTheme } from "@/hooks/useTheme"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { cn, isMacOS } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { externalThemePalette } from "@/themes/external"
import { getDeclaredAppearance, type ThemeDescriptor } from "@/themes/manifest"

export function ThemesPage() {
  const { theme, setTheme } = useTheme()
  const { descriptors, errors } = useThemeRegistry()

  return (
    <SettingsContent className={cn("w-full", { "pt-8": !isMacOS })}>
      <ThemeGrid themes={descriptors} active={theme} onSelect={setTheme} />
      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          {errors.map((error) => (
            <p key={error.package}>
              {error.package}: {error.message}
            </p>
          ))}
        </div>
      )}
    </SettingsContent>
  )
}

function ThemeGrid({
  themes,
  active,
  onSelect,
}: {
  themes: ThemeDescriptor[]
  active: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {themes.map((t) => {
        const isActive = active === t.id

        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col overflow-hidden rounded-lg border bg-secondary text-left transition-colors hover:bg-secondary-hover",
              isActive ? "border-primary ring-1 ring-primary" : "border-border",
            )}
          >
            <ThemePreview themeId={t.id} />

            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <span className="truncate text-sm">{t.name}</span>
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  isActive ? "border-primary text-primary" : "border-input",
                )}
              >
                {isActive && <CheckIcon className="w-3" />}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** A cropped window of the theme's minical and week view, painted from its tokens so it looks the same active or not. */
const ThemePreview = ({ themeId }: { themeId: string }) => {
  const { descriptors, externalThemes } = useThemeRegistry()
  const css = externalThemes.find((theme) => theme.id === themeId)?.css
  const style = useMemo(() => (css ? externalThemePalette(css) : undefined), [css])

  return (
    <div aria-hidden className="h-28 overflow-hidden pt-4 pl-4">
      <div
        data-theme={themeId}
        data-appearance={getDeclaredAppearance(themeId, descriptors) ?? undefined}
        style={style}
        className="flex h-[140px] w-[260px] overflow-hidden rounded-tl-lg bg-background shadow-lg"
      >
        <MinicalPreview />
        <WeekPreview />
      </div>
    </div>
  )
}

// A shortened month whose last two columns are the weekend; today is selected, as on launch.
const MINICAL_WEEKS = 4
const MINICAL_DAYS = 5
const TODAY = { week: 1, day: 1 }
const isOutsideDay = (week: number, day: number) =>
  (week === 0 && day < 1) || (week === MINICAL_WEEKS - 1 && day > 2)
const isMinicalWeekend = (day: number) => day >= MINICAL_DAYS - 2
const isWeekend = (day: number) => day >= 5

const MinicalPreview = () => (
  <div className="flex w-[76px] shrink-0 flex-col gap-2.5 border-r border-border pt-2.5">
    <div className="flex gap-1 px-2">
      <div className="h-1.5 w-6 rounded-xs bg-foreground" />
      <div className="h-1.5 w-3.5 rounded-xs bg-brand" />
    </div>

    <div className="flex flex-col px-1">
      {Array.from({ length: MINICAL_WEEKS }, (_, week) => (
        <div key={week} className={cn("flex", { "bg-hover": week === TODAY.week })}>
          {Array.from({ length: MINICAL_DAYS }, (_, day) => {
            const isToday = week === TODAY.week && day === TODAY.day

            return (
              <div
                key={day}
                className={cn("flex h-3 flex-1 items-center justify-center", {
                  "bg-weekend": isMinicalWeekend(day),
                })}
              >
                {isToday ? (
                  <div className="flex size-3 items-center justify-center rounded-circle bg-today">
                    <div className="size-1 bg-today-foreground" />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "size-1",
                      isOutsideDay(week, day) ? "bg-muted-foreground/40" : "bg-muted-foreground",
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  </div>
)

// Events in the theme's default calendar colour, so `--primary` and `--event-*` overrides show.
const PREVIEW_EVENTS = [
  { day: 0, top: 20, height: 30 },
  { day: 1, top: 40, height: 35 },
  { day: 2, top: 10, height: 25 },
  { day: 2, top: 50, height: 30 },
]

const WeekPreview = () => (
  <div className="flex grow flex-col">
    <div className="flex h-4 shrink-0 border-b border-border">
      {Array.from({ length: 7 }, (_, day) => (
        <div
          key={day}
          className={cn("flex flex-1 items-center justify-end border-r border-border px-1", {
            "bg-selected": day === TODAY.day,
            "bg-weekend": day !== TODAY.day && isWeekend(day),
          })}
        >
          {day === TODAY.day ? (
            <div className="flex h-2.5 w-3 items-center justify-center rounded-circle bg-today">
              <div className="h-0.5 w-1.5 bg-today-foreground" />
            </div>
          ) : (
            <div className="h-0.5 w-1.5 bg-muted-foreground" />
          )}
        </div>
      ))}
    </div>

    <div className="flex grow">
      {Array.from({ length: 7 }, (_, day) => (
        <div
          key={day}
          className={cn("relative flex-1 border-r border-border", {
            "bg-weekend": isWeekend(day),
          })}
        >
          {PREVIEW_EVENTS.filter((event) => event.day === day).map((event) => (
            <div
              key={event.top}
              data-slot="theme-preview-event"
              className="absolute inset-x-px overflow-hidden rounded-xs"
              style={{
                top: `${event.top}%`,
                height: `${event.height}%`,
                ...getCalendarEventStyle({ calendarColor: null, eventColor: null }),
              }}
            >
              <div className="absolute inset-y-0 left-0 w-[2px] bg-(--calendar-event-color)" />
            </div>
          ))}

          {day === TODAY.day && (
            <div className="absolute inset-x-0 top-[30%] border-t border-dashed border-today" />
          )}
        </div>
      ))}
    </div>
  </div>
)
