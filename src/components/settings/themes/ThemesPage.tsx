import { useMemo, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { ThemeMode } from "@/lib/api"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { cn, isMacOS } from "@/lib/utils"

import { useTheme } from "@/themes/ThemeController"
import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { externalThemePalette } from "@/themes/external"
import {
  type Appearance,
  getDeclaredAppearance,
  type ThemeDescriptor,
  themesFor,
} from "@/themes/manifest"

export function ThemesPage() {
  const { settings, activeSlot, setMode, setSlot } = useTheme()
  const { descriptors, errors } = useThemeRegistry()

  // Which slot's grid System shows; it only browses and never changes the theme.
  const [shownSlot, setShownSlot] = useState<Appearance | null>(null)
  const slot = settings.mode === "system" ? (shownSlot ?? activeSlot) : settings.mode
  const selected = settings[slot]

  // A legacy or hand-edited slot can hold a theme of the other appearance; keep it visible.
  const slotThemes = useMemo(() => {
    const fitting = themesFor(slot, descriptors)
    return descriptors.filter((theme) => fitting.includes(theme) || theme.id === selected)
  }, [descriptors, slot, selected])

  return (
    <SettingsContent className={cn("w-full", { "pt-8": !isMacOS })}>
      <div className="flex flex-col gap-3">
        <OptionTabs
          label="Appearance"
          options={MODE_OPTIONS}
          value={settings.mode}
          onChange={setMode}
        />
        {settings.mode === "system" && (
          <OptionTabs
            label="Theme slot"
            options={SLOT_OPTIONS}
            value={slot}
            onChange={setShownSlot}
          />
        )}
      </div>
      <ThemeGrid themes={slotThemes} selected={selected} onSelect={(id) => setSlot(slot, id)} />
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

const MODE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemeMode; label: string }[]

const SLOT_OPTIONS = [
  { value: "light", label: "Light theme" },
  { value: "dark", label: "Dark theme" },
] as const satisfies readonly { value: Appearance; label: string }[]

function OptionTabs<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex">
      <Tabs
        value={value}
        onValueChange={(next) => {
          const option = options.find((o) => o.value === next)
          if (option) onChange(option.value)
        }}
      >
        <TabsList aria-label={label}>
          {options.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}

function ThemeGrid({
  themes,
  selected,
  onSelect,
}: {
  themes: ThemeDescriptor[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-4">
      {themes.map((theme) => {
        const isActive = theme.id === selected

        // Block layout throughout: WebKit doesn't stretch a flex <button>'s children.
        return (
          <button
            key={theme.id}
            onClick={() => onSelect(theme.id)}
            aria-pressed={isActive}
            className="group block w-full min-w-0 outline-none"
          >
            <div
              className={cn(
                "overflow-hidden rounded-lg border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring",
                isActive
                  ? "border-primary ring-1 ring-primary"
                  : "border-border group-hover:border-muted-foreground",
              )}
            >
              <div aria-hidden className="relative h-28 overflow-hidden">
                <PreviewWindow themeId={theme.id} />
              </div>
            </div>
            <span
              className={cn(
                "block truncate pt-2 text-center text-sm transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {theme.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** A cropped window of the theme's minical and week view, painted from its tokens so it looks the same active or not. */
const PreviewWindow = ({ themeId }: { themeId: string }) => {
  const { descriptors, externalThemes } = useThemeRegistry()
  const css = externalThemes.find((theme) => theme.id === themeId)?.css
  const style = useMemo(() => (css ? externalThemePalette(css) : undefined), [css])
  // Omarchy's `system` inherits the window's appearance, which follows its palette.
  const appearance = getDeclaredAppearance(themeId, descriptors)

  return (
    <div
      data-theme={themeId}
      data-appearance={appearance === "system" ? undefined : (appearance ?? undefined)}
      style={style}
      className="absolute inset-0 bg-card pt-4 pl-4"
    >
      <div className="flex h-[140px] w-[260px] overflow-hidden rounded-tl-lg bg-background shadow-lg">
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
