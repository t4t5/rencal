import { defineConfig } from "@lingui/conf"
import { formatter } from "@lingui/format-po"

import { CATALOG_LANGUAGES } from "./src/lib/i18n/catalog-languages"

// English is the source language: message ids are the English text, so the
// "en" catalog needs no translations. A new language is a new entry in
// CATALOG_LANGUAGES plus its `src/locales/<lang>/messages.po` (see docs/i18n.md).
export default defineConfig({
  sourceLocale: "en",
  locales: [...CATALOG_LANGUAGES],
  fallbackLocales: { default: "en" },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**"],
    },
  ],
  format: formatter({ lineNumbers: false }),
  orderBy: "messageId",
})
