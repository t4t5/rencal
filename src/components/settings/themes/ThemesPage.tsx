import { useMemo } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"

import { useTheme } from "@/hooks/useTheme"
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-styles"
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
              "relative flex flex-col gap-2 p-3 rounded-md border-2 text-left transition-colors",
              isActive
                ? "border-primary"
                : "border-transparent hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <ThemePreview themeId={t.id} />
            <span className="text-sm">{t.name}</span>

            {isActive && (
              <div className="absolute top-1 right-1 size-5 rounded-full text-primary-foreground flex justify-center items-center bg-primary">
                <CheckIcon className="w-4" />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Three calendars' worth of colour, so event tints and `--event-color` overrides show.
const PREVIEW_EVENTS = [
  { top: 0, height: 45, color: DEFAULT_CALENDAR_COLOR },
  { top: 35, height: 65, color: "#f97316" },
  { top: 15, height: 40, color: "#10b981" },
]

/** A miniature sidebar + week view painted from the theme's tokens, so it looks the same active or not. */
const ThemePreview = ({ themeId }: { themeId: string }) => {
  const { descriptors, externalThemes } = useThemeRegistry()
  const css = externalThemes.find((theme) => theme.id === themeId)?.css
  const style = useMemo(() => (css ? externalThemePalette(css) : undefined), [css])

  return (
    <div
      data-theme={themeId}
      data-appearance={getDeclaredAppearance(themeId, descriptors) ?? undefined}
      style={style}
      aria-hidden
      className="h-24 w-full flex overflow-hidden rounded-sm border border-border bg-background"
    >
      <div className="w-[35%] shrink-0 flex flex-col gap-3 p-2.5 border-r border-border">
        <div className="h-3 w-5 rounded-xs bg-primary" />
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 rounded-xs bg-muted-foreground/40" />
          <div className="h-1.5 w-2/3 rounded-xs bg-muted-foreground/40" />
        </div>
      </div>

      <div className="grow flex gap-1 p-2.5">
        {PREVIEW_EVENTS.map((event) => (
          <div key={event.color} className="relative flex-1">
            <div
              data-slot="theme-preview-event"
              className="absolute inset-x-0 overflow-hidden rounded-xs"
              style={{
                top: `${event.top}%`,
                height: `${event.height}%`,
                ...getCalendarEventStyle({ calendarColor: event.color, eventColor: null }),
              }}
            >
              <div className="absolute left-0 inset-y-0 w-[2px] bg-(--calendar-event-color)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
