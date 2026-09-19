import { useMemo } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"

import { useTheme } from "@/hooks/useTheme"
import { cn, isMacOS } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { useThemeRegistry } from "@/themes/ThemeRegistry"
import { externalThemePalette } from "@/themes/external"
import type { ThemeDescriptor } from "@/themes/manifest"

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
              isActive ? "border-primary" : "border-transparent hover:bg-secondary",
            )}
          >
            <Palette themeId={t.id} />
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

const Palette = ({ themeId }: { themeId: string }) => {
  const { externalThemes } = useThemeRegistry()
  const css = externalThemes.find((theme) => theme.id === themeId)?.css
  const style = useMemo(() => (css ? externalThemePalette(css) : undefined), [css])

  return (
    <div
      data-theme={themeId}
      style={style}
      className="h-24 rounded-sm border border-border bg-background p-3 flex flex-col gap-3 w-full"
    >
      <div className="flex justify-between items-center gap-3">
        <div className="grow h-[5px] rounded bg-foreground" />
        <div className="size-4 rounded-circle bg-primary" />
      </div>

      <div className="grow relative">
        <div className="absolute inset-0 gap-2 flex justify-between">
          <div className="bg-(--hover-tint) grow opacity-5"></div>
          <div className="bg-(--hover-tint) grow opacity-5"></div>
          <div className="bg-(--hover-tint) grow opacity-10"></div>
        </div>

        <div className="absolute inset-0 flex flex-col">
          <div className="grow"></div>
          <div className="bg-(--hover-tint) grow opacity-5"></div>
        </div>
      </div>
    </div>
  )
}
