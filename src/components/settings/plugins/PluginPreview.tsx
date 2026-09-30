import { useState } from "react"

import { RencalLogomarkIcon } from "@/icons/rencal-logomark"

export function PluginPreview({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xs bg-muted">
      {url && !failed ? (
        <img
          src={url}
          alt={`${name} preview`}
          width={960}
          height={540}
          loading="lazy"
          decoding="async"
          className="absolute size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <RencalLogomarkIcon className="w-8 opacity-15 grayscale" />
      )}
    </div>
  )
}
