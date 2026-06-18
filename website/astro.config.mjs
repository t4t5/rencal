import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import starlightThemeRapide from "starlight-theme-rapide"

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
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
