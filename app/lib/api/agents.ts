import { rpc } from "@/rpc"
import type { Skill, SkillsStatus } from "@/rpc/bindings"

export type { Skill, SkillsStatus }

/** Skills renCal installs for coding agents. Install and uninstall resolve with the new status. */
export const agents = {
  skills: (): Promise<SkillsStatus> => rpc.agents.skills(),
  installSkill: (skill: Skill): Promise<SkillsStatus> => rpc.agents.install_skill(skill),
  uninstallSkill: (skill: Skill): Promise<SkillsStatus> => rpc.agents.uninstall_skill(skill),
} as const
