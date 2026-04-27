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
              data-theme={t.id}
              className="h-16 rounded-sm border border-border bg-background flex items-end p-2 gap-1.5"
            >
              <Swatch color="var(--foreground)" />
              <Swatch color="var(--primary)" />
              <Swatch color="var(--hover-tint)" />
            </div>
            <span className="text-sm">{t.name}</span>
            {isActive && (
              <div className="absolute top-1 right-1 size-5 rounded-full text-primary-foreground flex justify-center items-center bg-primary">
                <CheckIcon />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Swatch({ color }: { color: string }) {
  return <div className="size-5 rounded-full" style={{ backgroundColor: color }} />
}
