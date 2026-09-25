import { useState } from "react"

import { Input, InputAction } from "@/components/ui/input"

import { cn } from "@/lib/utils"

import { EyeIcon } from "@/icons/eye"
import { EyeClosedIcon } from "@/icons/eye-closed"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-9", className)} />
      <InputAction
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? <EyeIcon className="size-4" /> : <EyeClosedIcon className="size-4" />}
      </InputAction>
    </div>
  )
}
