import { computed, effect, signal, Text, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { SettingsContent, SettingsField } from "@/components/settings/SettingsContent"
import { Select } from "@/components/ui/select"

import type { ThemeMode } from "@/lib/api"
import { cn } from "@/lib/utils"

import { themeColors, type Vars } from "@/themes"
import { displayCase } from "@/themes"
import {
  externalThemeErrors,
  onOmarchy,
  setThemeMode,
  setThemeSlot,
  themeDescriptors,
  themeSettings,
  themeVars,
  undrawnSelectors,
} from "@/themes/controller"
import type { Appearance, ThemeDescriptor } from "@/themes/manifest"
import { type ThemeSlot, themesFor } from "@/themes/theme-settings"

import { PreviewWindow } from "./PreviewWindow"

const MODES = [
  { value: "single", title: "Single theme" },
  { value: "system", title: "Sync with system" },
]

const SLOTS: { value: Appearance; title: string }[] = [
  { value: "dark", title: "Dark theme" },
  { value: "light", title: "Light theme" },
]

export function ThemesPage() {
  const syncsWithSystem = () => themeSettings().mode === "system"

  // Which of the pair the grid edits while syncing; browsing never changes the theme.
  const pairSlot = signal<Appearance>("dark")
  const slot = (): ThemeSlot => (syncsWithSystem() ? pairSlot() : "single")

  // Independent of the selection, so picking a theme never reshuffles the grid.
  const slotThemes = computed(() => themesFor(slot(), themeDescriptors()))

  return (
    <SettingsContent>
      <SettingsField label="Theme mode" class="w-[180px]">
        <Select
          variant="default"
          items={MODES}
          value={themeSettings().mode}
          onChange={(mode) => setThemeMode(mode as ThemeMode)}
        />
      </SettingsField>
      <If
        when={syncsWithSystem() && onOmarchy()}
        else={
          <View class="gap-3">
            <If when={syncsWithSystem()}>
              <View class="h-[34px] flex-row items-center self-start">
                <Each of={SLOTS} key={(item) => item.value}>
                  {(item) => (
                    <BaseButton
                      onPress={() => pairSlot.set(item().value)}
                      class={cn(
                        "h-(--control-height) items-center justify-center rounded-(--radius-circle) px-3",
                        item().value === pairSlot() && "bg-secondary",
                      )}
                    >
                      <Text
                        class={cn(
                          "font-mono text-sm font-medium",
                          displayCase(),
                          item().value === pairSlot()
                            ? "text-secondary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {item().title}
                      </Text>
                    </BaseButton>
                  )}
                </Each>
              </View>
            </If>
            <ThemeGrid
              themes={slotThemes()}
              selected={themeSettings()[slot()]}
              onSelect={(id) => setThemeSlot(slot(), id)}
            />
          </View>
        }
      >
        <Text class="text-sm text-muted-foreground">renCal follows your Omarchy theme.</Text>
      </If>
      <If when={externalThemeErrors().length > 0}>
        <View class="gap-1">
          <Each of={externalThemeErrors()} key={(error) => error.package}>
            {(error) => (
              <Text class="text-sm text-destructive">
                {error().package}: {error().message}
              </Text>
            )}
          </Each>
        </View>
      </If>
    </SettingsContent>
  )
}

function ThemeGrid(props: {
  themes: readonly ThemeDescriptor[]
  selected: string
  onSelect: (id: string) => void
}) {
  const palettes = signal<Record<string, Vars>>({})

  // A palette per theme, so a tile looks the same active or not.
  effect(() => {
    for (const theme of props.themes) {
      void themeColors(themeVars(theme.id), theme.appearance).then((colors) =>
        palettes.update((all) => ({ ...all, [theme.id]: colors })),
      )
    }
  })

  return (
    <View class="grid max-w-[640px] grid-cols-3 gap-x-3 gap-y-4">
      <Each of={props.themes} key={(theme) => theme.id}>
        {(theme) => (
          <ThemeTile
            theme={theme()}
            palette={palettes()[theme().id]}
            selected={theme().id === props.selected}
            onSelect={() => props.onSelect(theme().id)}
          />
        )}
      </Each>
    </View>
  )
}

function ThemeTile(props: {
  theme: ThemeDescriptor
  palette: Vars | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <BaseButton
      accessibilityLabel={props.theme.name}
      onPress={props.onSelect}
      class="group min-w-0"
    >
      <View
        class={cn(
          "h-28 overflow-hidden rounded-(--radius-lg) border",
          props.selected
            ? "border-primary ring-1 ring-primary"
            : "border-border group-hover:border-muted-foreground",
        )}
      >
        <If when={props.palette}>{(palette) => <PreviewWindow palette={palette()} />}</If>
      </View>
      <Text
        class={cn(
          "truncate pt-2 text-center text-sm",
          props.selected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {props.theme.name}
      </Text>
      <If when={undrawnSelectors(props.theme.id) > 0}>
        <Text class="text-center text-xs text-muted-foreground">Colors only on this build</Text>
      </If>
    </BaseButton>
  )
}
