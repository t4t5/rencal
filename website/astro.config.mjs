import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import starlightThemeRapide from "starlight-theme-rapide"

import { site } from "./src/site"
import starlightRenTheme from "./src/starlight-ren-theme"

const userManualItems = [
  { label: "Calendar Data", slug: "docs/calendar-data" },
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
      title: site.title,
      plugins: [starlightThemeRapide(), starlightRenTheme()],
      customCss: ["/src/styles/fonts.css"],
      head: [
        { tag: "meta", attrs: { property: "og:image", content: site.ogImage } },
        { tag: "meta", attrs: { name: "twitter:image", content: site.ogImage } },
        { tag: "link", attrs: { rel: "icon", type: "image/svg+xml", href: site.favicon } },
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: site.geistMonoStylesheet,
          },
        },
        {
          tag: "script",
          attrs: {
            defer: true,
            "data-domain": site.analyticsDomain,
            src: site.analyticsScript,
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
