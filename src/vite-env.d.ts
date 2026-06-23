/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RENCAL_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Built-in themes bundled + scoped by the `rencal-themes` Vite plugin.
declare module "virtual:rencal-themes.css"
