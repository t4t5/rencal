import { effect, lifecycle, openUrl, signal, Text, View } from "nsh"
import { Button as BaseButton } from "nsh/base"

import { ErrorText, SettingsContent } from "@/components/settings/SettingsContent"
import { Checkbox } from "@/components/ui/checkbox"

import { api, getErrorMessage, type Skill, type SkillsStatus } from "@/lib/api"
import { logger } from "@/lib/logger"

type SkillState = SkillsStatus["skills"][number]

const SKILLS: { skill: Skill; label: string; description: string }[] = [
  {
    skill: "caldir",
    label: "caldir",
    description: "Read, create and edit your events with the caldir CLI.",
  },
  {
    skill: "rencal",
    label: "renCal",
    description: "Build your own renCal views, themes and providers.",
  },
]

const CALDIR_INSTALL_URL = "https://caldir.org/quickstart/"

/** "a, b and c". */
export function joinNames(names: readonly string[]): string {
  if (names.length < 2) return names.join("")
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

export function AgentsPage() {
  const status = signal<SkillsStatus | null>(null)

  // The caldir CLI or a new agent may have been installed while renCal was in the background.
  effect(() => {
    lifecycle()
    let cancelled = false
    api.agents
      .skills()
      .then((next) => {
        if (!cancelled) status.set(next)
      })
      .catch((error: unknown) => logger.error("Failed to check agent skills", error))
    return () => {
      cancelled = true
    }
  })

  return (
    <If when={status()}>
      {(current) => (
        <If
          when={current().supported}
          else={
            <SettingsContent>
              <Text class="w-[400px] text-sm text-muted-foreground">
                Installing agent skills is supported on Linux and macOS.
              </Text>
            </SettingsContent>
          }
        >
          <SettingsContent>
            <Text class="w-[400px] text-sm">
              Tick a skill to install it for your coding agents.
            </Text>
            <If when={current().skills.every((state) => state.agents.length === 0)}>
              <Text class="w-[400px] text-sm">
                No supported coding agent was found in your home folder.
              </Text>
            </If>
            <Each of={SKILLS} key={(item) => item.skill}>
              {(item) => (
                <If when={current().skills.find((state) => state.skill === item().skill)}>
                  {(state) => (
                    <SkillRow
                      state={state()}
                      label={item().label}
                      description={item().description}
                      onChange={(next) => status.set(next)}
                    />
                  )}
                </If>
              )}
            </Each>
          </SettingsContent>
        </If>
      )}
    </If>
  )
}

function SkillRow(props: {
  state: SkillState
  label: string
  description: string
  onChange: (status: SkillsStatus) => void
}) {
  const busy = signal(false)
  const error = signal<string | null>(null)

  const agentsWith = (link: SkillState["agents"][number]["link"]) =>
    props.state.agents.filter((agent) => agent.link === link).map((agent) => agent.name)
  const missing = () => agentsWith("missing")
  const installed = () => agentsWith("linked").length > 0

  const run = async (install: boolean) => {
    busy.set(true)
    error.set(null)
    try {
      props.onChange(
        await (install
          ? api.agents.installSkill(props.state.skill)
          : api.agents.uninstallSkill(props.state.skill)),
      )
    } catch (e) {
      error.set(
        getErrorMessage(e, install ? "Failed to add the skill" : "Failed to remove the skill"),
      )
    } finally {
      busy.set(false)
    }
  }

  return (
    <View class="w-[400px] gap-1">
      <Checkbox
        checked={installed()}
        disabled={busy() || !props.state.available || props.state.agents.length === 0}
        onChange={(checked) => void run(checked)}
      >
        <Text class="text-sm">{props.label}</Text>
      </Checkbox>
      <View class="gap-1 pl-6">
        <Text class="text-xs text-muted-foreground">{props.description}</Text>
        <If when={!props.state.available}>
          <View class="flex-row gap-1">
            <Text class="text-xs text-muted-foreground">Needs the caldir CLI.</Text>
            <BaseButton onPress={() => void openUrl(CALDIR_INSTALL_URL)}>
              <Text class="text-xs text-primary hover:underline">Install it</Text>
            </BaseButton>
          </View>
        </If>
        <If when={installed() && missing().length > 0}>
          <BaseButton class="self-start" disabled={busy()} onPress={() => void run(true)}>
            <Text class="text-xs text-primary hover:underline">Add to {joinNames(missing())}</Text>
          </BaseButton>
        </If>
        <ErrorText message={error()} class="text-xs" />
      </View>
    </View>
  )
}
