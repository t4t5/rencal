import fs from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"

// Bundles the built-in theme files (src/themes/*.css) into a single virtual CSS
// module, wrapping each in its [data-theme] selector.
// Id ends in `.css` so Vite routes the output through its CSS pipeline.
const VIRTUAL_ID = "virtual:rencal-themes.css"
const RESOLVED_ID = "\0virtual:rencal-themes.css"

export function rencalThemes(themesDir = path.resolve(__dirname, "src/themes")): Plugin {
  function bundle(): string {
    return fs
      .readdirSync(themesDir)
      .filter((file) => file.endsWith(".css"))
      .sort()
      .map((file) => {
        const id = path.basename(file, ".css")
        const css = fs.readFileSync(path.join(themesDir, file), "utf8")
        return `[data-theme="${id}"] {\n${css}\n}`
      })
      .join("\n\n")
  }

  return {
    name: "rencal-themes",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) return bundle()
    },
    configureServer(server) {
      // Re-bundle + reload when a built-in theme file changes in dev.
      server.watcher.add(themesDir)
      const onChange = (file: string) => {
        if (path.dirname(file) !== themesDir || !file.endsWith(".css")) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: "full-reload" })
      }
      server.watcher.on("add", onChange)
      server.watcher.on("change", onChange)
      server.watcher.on("unlink", onChange)
    },
  }
}
