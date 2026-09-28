// Restore the theme before React mounts to avoid a flash. The theme controller
// caches which theme to show for each OS appearance; the window is unforced at
// launch, so the media query reports the OS. The fallback is the default pair.
const appearance = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
let theme = appearance === "dark" ? "ren" : "ren-light"
try {
  const cached = JSON.parse(localStorage.getItem("themeByAppearance"))?.[appearance]
  if (typeof cached === "string" && cached) theme = cached
} catch {}
document.body.dataset.theme = theme

// Apply the theme's last-known background so we don't flash a stale color
// before the CSS bundle (and any external-theme <style>) loads.
try {
  const background = JSON.parse(localStorage.getItem("themeBackgrounds"))?.[theme]
  if (typeof background === "string") {
    document.body.style.setProperty("--background", background)
    document.documentElement.style.backgroundColor = background
  }
} catch {}
