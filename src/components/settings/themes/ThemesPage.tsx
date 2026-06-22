import { openPath } from "@tauri-apps/plugin-opener"

import { rpc } from "@/rpc"

import { useTheme } from "@/hooks/useTheme"
import { cn } from "@/lib/utils"

import { CheckIcon } from "@/icons/check"
import { useThemeRegistry } from "@/themes/ThemeRegistry"
import type { ThemeDescriptor } from "@/themes/manifest"

export function ThemesPage() {
  const { theme, setTheme } = useTheme()
  const { descriptors } = useThemeRegistry()

  const builtins = descriptors.filter((d) => d.source === "builtin")
  const externals = descriptors.filter((d) => d.source === "external")

  async function openThemesFolder() {
    try {
      await openPath(await rpc.themes.themes_dir())
    } catch (err) {
      console.error("Failed to open themes folder:", err)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-[500px]">
      <ThemeGrid themes={builtins} active={theme} onSelect={setTheme} />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm text-muted-foreground">Custom themes</h2>
          <button
            onClick={openThemesFolder}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Open themes folder
          </button>
        </div>

        {externals.length > 0 ? (
          <ThemeGrid themes={externals} active={theme} onSelect={setTheme} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Drop a <code>.css</code> file into <code>~/.config/rencal/themes</code> to add your own.
          </p>
        )}
      </div>
    </div>
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
    <div className="grid grid-cols-2 gap-3">
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
