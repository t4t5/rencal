import { rpc } from "@/rpc"
import type { CommandInvocation, CommandOutcome, CommandRequest } from "@/rpc/bindings"

export type { CommandInvocation, CommandOutcome, CommandRequest }

/** Drain `rencal do` requests queued since the last call. */
export function takePendingCommands(): Promise<CommandRequest[]> {
  return rpc.commands.take_pending()
}

/** Report how a drained request went; `rencal do` prints it. */
export function respondToCommand(id: number, outcome: CommandOutcome): Promise<void> {
  return rpc.commands.respond(id, outcome)
}
