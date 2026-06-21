import type { StarlightPlugin } from "@astrojs/starlight/types"

export default function starlightRenTheme(): StarlightPlugin {
  return {
    name: "starlight-ren-theme",
    hooks: {
      "config:setup"({ config, updateConfig }) {
        updateConfig({
          components: {
            ...config.components,
            Header: "./src/components/starlight/Header.astro",
            MobileMenuFooter: "./src/components/starlight/MobileMenuFooter.astro",
            ThemeProvider: "./src/components/starlight/DarkThemeProvider.astro",
            ThemeSelect: "./src/components/starlight/ThemeSelect.astro",
          },
          customCss: [...(config.customCss ?? []), "/src/styles/docs.css"],
        })
      },
    },
  }
}
