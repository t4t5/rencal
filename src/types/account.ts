import { z } from "zod"

export const AccountSchema = z.object({
  id: z.string(),
  provider: z.literal("Google"), // Future: z.enum(["Google", "ICloud", "CalDAV"])
  email: z.string().nullable(),
  access_token: z.string().nullable(),
  refresh_token: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
})

export type Account = z.infer<typeof AccountSchema>
