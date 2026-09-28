// Restore the persisted theme before React mounts to avoid a flash. The theme
// controller caches its settings (`themeSettings`) and each slot's background;
// the window is unforced at launch, so the media query reports the OS.
const defaults = document.body.dataset
let settings = {
  mode: "system",
  light: defaults.defaultLightTheme,
  dark: defaults.defaultDarkTheme,
}
try {
  const stored = JSON.parse(localStorage.getItem("themeSettings"))
  if (stored && typeof stored === "object") settings = { ...settings, ...stored }
} catch {}
const slot =
  settings.mode === "light" || settings.mode === "dark"
    ? settings.mode
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
const theme = typeof settings[slot] === "string" && settings[slot] ? settings[slot] : "ren"
document.body.dataset.theme = theme

// Apply the slot's last-known background so we don't flash a stale color
// before the CSS bundle (and any external-theme <style>) loads.
try {
  const cached = JSON.parse(localStorage.getItem("themeBackgrounds"))?.[slot]
  if (cached?.theme === theme && typeof cached.background === "string") {
    document.body.style.setProperty("--background", cached.background)
    document.documentElement.style.backgroundColor = cached.background
  }
} catch {}
