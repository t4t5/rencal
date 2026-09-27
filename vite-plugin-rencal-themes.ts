import fs from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"

// Bundles the built-in theme files (src/themes/*.css) into a single virtual CSS
// module, wrapping each in its [data-theme] selector. `<id>.light.css` and
// `<id>.dark.css` are the variants of one theme, scoped by [data-appearance] too.
// Id ends in `.css` so Vite routes the output through its CSS pipeline.
const VIRTUAL_ID = "virtual:rencal-themes.css"
const RESOLVED_ID = "\0virtual:rencal-themes.css"

function themeSelector(file: string): string {
  const [, id, appearance] = /^(.+?)(?:\.(light|dark))?\.css$/.exec(file) ?? []
  if (!id) throw new Error(`Not a theme file: ${file}`)
  return appearance
    ? `[data-theme="${id}"][data-appearance="${appearance}"]`
    : `[data-theme="${id}"]`
}

export function rencalThemes(themesDir = path.resolve(__dirname, "src/themes")): Plugin {
  function bundle(): string {
    return fs
      .readdirSync(themesDir)
      .filter((file) => file.endsWith(".css"))
      .sort()
      .map((file) => {
        const css = fs.readFileSync(path.join(themesDir, file), "utf8")
        return `${themeSelector(file)} {\n${css}\n}`
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
