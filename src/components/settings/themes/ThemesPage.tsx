import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { themes, type ThemeId } from "@/themes/manifest"

export function ThemesPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="grid grid-cols-2 gap-3 max-w-[500px]">
      {themes.map((t) => {
        const isActive = theme === t.id
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id as ThemeId)}
            className={cn(
              "relative flex flex-col gap-2 p-3 rounded-md border-2 text-left transition-colors",
              isActive ? "border-primary" : "border-transparent hover:bg-secondary",
            )}
          >
            <div
              className="h-16 rounded-sm border border-border"
              style={{ backgroundColor: t.background }}
            />
            <span className="text-sm">{t.name}</span>
            {isActive && <CheckIcon className="absolute top-2 right-2 size-4 text-primary" />}
          </button>
        )
      })}
    </div>
  )
}
