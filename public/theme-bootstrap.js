// Restore persisted theme before React mounts to avoid a flash.
const defaultTheme = document.body.dataset.defaultTheme || "ren"
try {
  document.body.dataset.theme = JSON.parse(localStorage.getItem("theme")) || defaultTheme
} catch {
  document.body.dataset.theme = defaultTheme
}

// Restore the last resolved appearance too: it picks the variant of a theme
// with both light and dark CSS, and the `dark:` styles.
try {
  const appearance = localStorage.getItem("themeAppearanceResolved")
  if (appearance === "light" || appearance === "dark") {
    document.body.dataset.appearance = appearance
  }
} catch {}

// Apply the active theme's last-known background so we don't flash a stale
// color before the CSS bundle (and any external-theme <style>) loads. Works
// for every theme because useTheme caches the resolved --background on change.
try {
  const background = localStorage.getItem("themeBackground")
  if (background) {
    document.body.style.setProperty("--background", background)
    document.documentElement.style.backgroundColor = background
  }
} catch {}
