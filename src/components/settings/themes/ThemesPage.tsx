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

const Palette = ({ themeId }: { themeId: string }) => (
  <div
    data-theme={themeId}
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
