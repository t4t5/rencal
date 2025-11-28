import { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

export const Section = ({ children }: { children: ReactNode }) => {
  return <div className="flex gap-3 text-sm text-muted-foreground px-3">{children}</div>
}

export const SectionIcon = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => {
  return <div className={cn("size-4 pt-0.5", className)}>{children}</div>
}

export function SectionInput({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "placeholder:text-muted-foreground outline-none! text-primary-foreground disabled:text-muted-foreground",
        className,
      )}
      type={type}
      {...props}
    />
  )
}
