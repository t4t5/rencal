// Restore persisted theme before React mounts to avoid a flash.
const defaultTheme = document.body.dataset.defaultTheme || "ren"
try {
  document.body.dataset.theme = JSON.parse(localStorage.getItem("theme")) || defaultTheme
} catch {
  document.body.dataset.theme = defaultTheme
}

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
