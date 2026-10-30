import { openUrl } from "@tauri-apps/plugin-opener"
import { useCallback, useEffect, useId, useState } from "react"

import { SettingsContent } from "@/components/settings/SettingsContent"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { api, getErrorMessage, type Skill, type SkillsStatus } from "@/lib/api"
import { logger } from "@/lib/logger"

type SkillState = SkillsStatus["skills"][number]

const SKILLS: { skill: Skill; label: string; description: string }[] = [
  {
    skill: "caldir",
    label: "caldir",
    description: "Lets agents read, create and edit your events with the caldir CLI.",
  },
  {
    skill: "rencal",
    label: "renCal",
    description: "Lets agents build your own views, themes and calendar providers.",
  },
]

const CALDIR_INSTALL_URL = "https://caldir.org/quickstart/"

const listFormat = new Intl.ListFormat("en", { type: "conjunction" })

export function AgentsPage() {
  const [status, setStatus] = useState<SkillsStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.agents.skills())
    } catch (err) {
      logger.error("Failed to check agent skills", err)
    }
  }, [])

  // The caldir CLI or a new agent may have been installed while renCal was in the background.
  useEffect(() => {
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [refresh])

  if (!status) return null

  if (!status.supported) {
    return (
      <SettingsContent>
        <p className="text-sm text-muted-foreground w-[400px]">
          Installing agent skills is supported on Linux and macOS.
        </p>
      </SettingsContent>
    )
  }

  const noAgents = status.skills.every((state) => state.agents.length === 0)

  return (
    <SettingsContent>
      <p className="text-xs text-muted-foreground w-[400px]">
        Tick a skill to install it for your coding agents.
      </p>
      {noAgents && (
        <p className="text-sm w-[400px]">
          No supported coding agent was found in your home folder.
        </p>
      )}
      {SKILLS.map(({ skill, label, description }) => {
        const state = status.skills.find((candidate) => candidate.skill === skill)
        return (
          state && (
            <SkillRow
              key={skill}
              state={state}
              label={label}
              description={description}
              onChange={setStatus}
            />
          )
        )
      })}
    </SettingsContent>
  )
}

function SkillRow({
  state,
  label,
  description,
  onChange,
}: {
  state: SkillState
  label: string
  description: string
  onChange: (status: SkillsStatus) => void
}) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const agentsWith = (link: SkillState["agents"][number]["link"]) =>
    state.agents.filter((agent) => agent.link === link).map((agent) => agent.name)
  const linked = agentsWith("linked")
  const missing = agentsWith("missing")
  const installed = linked.length > 0

  const run = async (install: boolean) => {
    setBusy(true)
    setError(null)
    try {
      onChange(
        await (install
          ? api.agents.installSkill(state.skill)
          : api.agents.uninstallSkill(state.skill)),
      )
    } catch (err) {
      setError(
        getErrorMessage(err, install ? "Failed to add the skill" : "Failed to remove the skill"),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1 w-[400px]">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={installed}
          disabled={busy || !state.available || state.agents.length === 0}
          onCheckedChange={(checked) => void run(checked === true)}
        />
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      </div>
      <div className="flex flex-col gap-1 pl-7 text-xs text-muted-foreground">
        <p>{description}</p>
        {!state.available && (
          <p>
            Needs the caldir CLI.{" "}
            <button
              type="button"
              onClick={() => void openUrl(CALDIR_INSTALL_URL)}
              className="text-primary hover:underline cursor-pointer"
            >
              Install it
            </button>
          </p>
        )}
        {installed && (
          <p>
            Installed for {listFormat.format(linked)}.
            {missing.length > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(true)}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Add to {listFormat.format(missing)}
                </button>
              </>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive break-words">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
