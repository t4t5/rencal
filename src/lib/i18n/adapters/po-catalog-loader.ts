import type { Messages } from "@lingui/core"

import type { CatalogLoader } from "@/lib/i18n/ports"

import { loadCatalog } from "@/locales/load-catalog"

/** Adapter: the .po catalogs under src/locales. */
export class PoCatalogLoader implements CatalogLoader {
  load(language: string): Promise<Messages> {
    return loadCatalog(language)
  }
}
