import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import starlightThemeRapide from "starlight-theme-rapide"

import starlightRenTheme from "./src/starlight-ren-theme"

const userManualItems = [
  { label: "Calendars", slug: "docs/calendars" },
  { label: "Keyboard Shortcuts", slug: "docs/keyboard-shortcuts" },
  { label: "Themes", slug: "docs/themes" },
  { label: "Agents", slug: "docs/agents" },
]

export default defineConfig({
  redirects: {
    "/docs": `/${userManualItems[0].slug}`,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "renCal",
      plugins: [starlightThemeRapide(), starlightRenTheme()],
      customCss: ["/src/styles/fonts.css"],
      head: [
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&display=swap",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [{ label: "Installation", slug: "docs/installation" }],
        },
        {
          label: "User Manual",
          items: userManualItems,
        },
        {
          label: "Help",
          items: [{ label: "Troubleshooting", slug: "docs/troubleshooting" }],
        },
      ],
    }),
  ],
})
