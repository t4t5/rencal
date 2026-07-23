import starlight from "@astrojs/starlight"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "astro/config"
import starlightThemeRapide from "starlight-theme-rapide"

import { site } from "./src/site"
import starlightRenTheme from "./src/starlight-ren-theme"

const sidebarItems = [
  {
    label: "Getting started",
    items: [
      { label: "Installation", slug: "docs/installation" },
      { label: "Quick start", slug: "docs/quick-start" },
    ],
  },
  {
    label: "User manual",
    items: [
      { label: "Creating and editing events", slug: "docs/creating-and-editing-events" },
      { label: "Accounts and providers", slug: "docs/accounts-and-providers" },
      { label: "Calendars and groups", slug: "docs/calendars-and-groups" },
      { label: "Reminders and notifications", slug: "docs/reminders-and-notifications" },
    ],
  },
  {
    label: "Customize and automate",
    items: [
      { label: "Themes", slug: "docs/themes" },
      { label: "Agents and the caldir CLI", slug: "docs/agents" },
    ],
  },
  {
    label: "Reference",
    items: [
      { label: "Keyboard shortcuts", slug: "docs/keyboard-shortcuts" },
      { label: "Troubleshooting", slug: "docs/troubleshooting" },
    ],
  },
]

export default defineConfig({
  redirects: {
    "/docs": `/${sidebarItems[0].items[0].slug}`,
    "/docs/calendar-data": "/docs/calendars-and-groups",
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
      sidebar: sidebarItems,
    }),
  ],
})
