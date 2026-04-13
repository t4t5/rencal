import { useState } from "react"
import { PiEyeClosed as EyeClosedIcon, PiEye as EyeIcon } from "react-icons/pi"

import { Input } from "@/components/ui/input"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? <EyeIcon className="size-4" /> : <EyeClosedIcon className="size-4" />}
      </button>
    </div>
  )
}
