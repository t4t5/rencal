import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"
import starlightThemeRapide from "starlight-theme-rapide"

export default defineConfig({
  integrations: [
    starlight({
      title: "renCal",
      plugins: [starlightThemeRapide()],
      sidebar: [
        { label: "Docs", slug: "docs" },
        { label: "Example", slug: "docs/example" },
      ],
    }),
  ],
})
