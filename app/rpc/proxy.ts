/*
 * `rpc.caldir.list_events(...)`, as taurpc's proxy gave it, over `Backend.call`.
 * The generated `Router` type in ./bindings stays the contract with Rust.
 */
import { Backend } from "rencal/native"

export type InferCommandOutput<
  R,
  Path extends keyof R,
  Method extends keyof R[Path],
> = R[Path][Method] extends (...args: never[]) => Promise<infer Output> ? Output : never

type Reply = { ok?: unknown; err?: unknown }

async function call(path: string, args: unknown[]): Promise<unknown> {
  const reply = (await Backend.call(
    path,
    args.map((arg) => arg ?? null),
  )) as Reply
  // Rejects with the RpcError object itself, as `@/lib/api/errors` expects.
  if ("err" in reply) throw reply.err
  return reply.ok
}

export function createProxy<R extends object>(_argsMap: unknown): R {
  return new Proxy({} as R, {
    get: (_router, group: string) =>
      new Proxy(
        {},
        {
          get:
            (_group, method: string) =>
            (...args: unknown[]) =>
              call(`${group}.${method}`, args),
        },
      ),
  })
}
