import { openUrl } from "@tauri-apps/plugin-opener"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { BugIcon } from "@/icons/bug"

export const ReportBugButton = () => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => openUrl("https://github.com/t4t5/rencal/issues/new")}
        >
          <BugIcon className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Report a bug</TooltipContent>
    </Tooltip>
  )
}
