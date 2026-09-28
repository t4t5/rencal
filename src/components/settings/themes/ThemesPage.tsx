import { useMemo, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { useTheme } from "@/hooks/useTheme"
import type { AppearanceSetting, ExternalTheme } from "@/lib/api"
import { getCalendarEventStyle } from "@/lib/event-styles"
import { cn, isMacOS } from "@/lib/utils"

import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { appearanceFromCss } from "@/themes/appearance"
import { externalThemePalette } from "@/themes/external"
import {
  getDeclaredAppearance,
  getThemeFamilies,
  type ThemeDescriptor,
  type ThemeFamily,
} from "@/themes/manifest"

export function ThemesPage() {
  const { theme, appearance, setSettings, setAppearance } = useTheme()
  const { descriptors, externalThemes, errors } = useThemeRegistry()
  const families = useMemo(
    () =>
      getThemeFamilies(descriptors).map((family) => ({
        ...family,
        tabs: getFamilyTabs(family, descriptors, externalThemes),
      })),
    [descriptors, externalThemes],
  )
  const active = families.find((family) => isActiveFamily(family, theme))

  // The tab shows the stored appearance, or a single theme's own when they differ (it
  // ignores the stored one). A tab that doesn't list the active theme only filters
  // the grid until a theme is picked there.
  const [browsing, setBrowsing] = useState<AppearanceSetting | null>(null)
  const tab =
    browsing ??
    (active && !active.tabs.includes(appearance) ? active.tabs[0] : undefined) ??
    appearance

  const selectTab = (next: AppearanceSetting) => {
    if (active?.tabs.includes(next)) {
      setBrowsing(null)
      setAppearance(next)
    } else {
      setBrowsing(next)
    }
  }

  const selectFamily = (id: string) => {
    setBrowsing(null)
    setSettings({ theme: id, appearance: tab })
  }

  return (
    <SettingsContent className={cn("w-full", { "pt-8": !isMacOS })}>
      <AppearanceSection tab={tab} onChange={selectTab} />
      <ThemeGrid
        families={families.filter((family) => family.tabs.includes(tab))}
        active={active}
        tab={tab}
        onSelect={selectFamily}
      />
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

// A hand-edited config can name a variant rather than its family.
const isActiveFamily = (family: ThemeFamily, theme: string) =>
  family.id === theme || family.variants?.light === theme || family.variants?.dark === theme

const APPEARANCE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: AppearanceSetting; label: string }[]

/**
 * The appearance tabs that list a family: a family with variants under every
 * tab, Omarchy (which follows the OS theme) under System, and any other theme
 * under its own appearance.
 */
function getFamilyTabs(
  family: ThemeFamily,
  descriptors: readonly ThemeDescriptor[],
  externalThemes: readonly ExternalTheme[],
): AppearanceSetting[] {
  if (family.variants) return APPEARANCE_OPTIONS.map((option) => option.value)
  const css = externalThemes.find((theme) => theme.id === family.id)?.css
  const appearance =
    getDeclaredAppearance(family.id, descriptors) ??
    (css === undefined ? null : appearanceFromCss(css))
  return [appearance ?? "system"]
}

const AppearanceSection = ({
  tab,
  onChange,
}: {
  tab: AppearanceSetting
  onChange: (appearance: AppearanceSetting) => void
}) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm">Appearance</span>
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const option = APPEARANCE_OPTIONS.find((o) => o.value === value)
        if (option) onChange(option.value)
      }}
    >
      <TabsList aria-label="Appearance">
        {APPEARANCE_OPTIONS.map((option) => (
          <TabsTrigger key={option.value} value={option.value}>
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  </div>
)

function ThemeGrid({
  families,
  active,
  tab,
  onSelect,
}: {
  families: ThemeFamily[]
  active: ThemeFamily | undefined
  tab: AppearanceSetting
  onSelect: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-4">
      {families.map((family) => {
        const isActive = family.id === active?.id

        // Block layout throughout: WebKit doesn't stretch a flex <button>'s children.
        return (
          <button
            key={family.id}
            onClick={() => onSelect(family.id)}
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
              <ThemePreview family={family} tab={tab} />
            </div>
            <span
              className={cn(
                "block truncate pt-2 text-center text-sm transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {family.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** The theme the tab shows; under System, a family's light variant with the dark one over the right half. */
const ThemePreview = ({ family, tab }: { family: ThemeFamily; tab: AppearanceSetting }) => (
  <div aria-hidden className="relative h-28 overflow-hidden">
    {!family.variants ? (
      <PreviewWindow themeId={family.id} />
    ) : tab === "system" ? (
      <>
        <PreviewWindow themeId={family.variants.light} />
        <PreviewWindow themeId={family.variants.dark} className="[clip-path:inset(0_0_0_50%)]" />
      </>
    ) : (
      <PreviewWindow themeId={family.variants[tab]} />
    )}
  </div>
)

/** A cropped window of the theme's minical and week view, painted from its tokens so it looks the same active or not. */
const PreviewWindow = ({ themeId, className }: { themeId: string; className?: string }) => {
  const { descriptors, externalThemes } = useThemeRegistry()
  const css = externalThemes.find((theme) => theme.id === themeId)?.css
  const style = useMemo(() => (css ? externalThemePalette(css) : undefined), [css])

  return (
    <div
      data-theme={themeId}
      data-appearance={getDeclaredAppearance(themeId, descriptors) ?? undefined}
      style={style}
      className={cn("absolute inset-0 bg-card pt-4 pl-4", className)}
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
