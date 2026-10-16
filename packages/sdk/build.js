// Builds each view in a plugin's rencal-plugin.toml into the single-file ES
// module (and stylesheet) renCal loads, at the paths the manifest names.
import tailwindcss from "@tailwindcss/vite"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "smol-toml"
import { build } from "vite"

import { sharedModules } from "./shared-modules.js"

const MANIFEST = "rencal-plugin.toml"
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"]
const tailwindCss = fileURLToPath(new URL("./tailwind.css", import.meta.url))

/**
 * @param {string} root the plugin directory
 * @param {{ watch?: boolean }} [options]
 */
export async function buildViews(root, { watch = false } = {}) {
  const views = await readViews(root)
  // Tailwind watches the files it scans, built views included, so each
  // rebuild would otherwise trigger the next.
  const outputs = views.map((view) => join(root, dirname(view.script), "**"))
  for (const view of views) {
    await build(viewConfig(root, view, views.length === 1, watch ? { exclude: outputs } : null))
  }
}

async function readViews(root) {
  const path = join(root, MANIFEST)
  if (!existsSync(path)) throw new Error(`No ${MANIFEST} in ${root}`)
  const views = parse(await readFile(path, "utf8")).contributes?.views
  if (!Array.isArray(views) || views.length === 0) {
    throw new Error(`${MANIFEST} has no [[contributes.views]] to build`)
  }
  return views
}

// `src/<view-id>.tsx`, or `src/index.tsx` when the plugin has one view.
function findEntry(root, viewId, only) {
  const names = only ? [viewId, "index"] : [viewId]
  for (const name of names) {
    for (const extension of EXTENSIONS) {
      const path = join(root, "src", name + extension)
      if (existsSync(path)) return path
    }
  }
  const expected = names.map((name) => `src/${name}.tsx`).join(" or ")
  throw new Error(`View "${viewId}" needs an entry at ${expected}`)
}

function viewConfig(root, view, only, watch) {
  const entry = findEntry(root, view.id, only)
  const outDir = dirname(view.script)
  if (view.css && dirname(view.css) !== outDir) {
    throw new Error(`View "${view.id}": css must sit next to script`)
  }

  return {
    root,
    plugins: [tailwindcss(), viewStyles(view, entry)],
    // Library builds leave this in bundled dependencies, and the webview has no `process`.
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      outDir: join(root, outDir),
      // Views can share an output directory, so never wipe it.
      emptyOutDir: false,
      copyPublicDir: false,
      // Committed to the repository, so keep diffs readable.
      minify: false,
      lib: {
        entry,
        formats: ["es"],
        fileName: () => basename(view.script),
        cssFileName: view.css ? basename(view.css, ".css") : undefined,
      },
      rolldownOptions: {
        // renCal provides these at runtime; everything else is bundled in.
        external: [...sharedModules],
        // renCal loads one file per view, so code-split chunks would fail to load.
        output: { codeSplitting: false },
      },
      watch,
    },
  }
}

// Adds the Tailwind setup to views that declare `css`, and catches styles a
// view without `css` would silently drop.
function viewStyles(view, entry) {
  return {
    name: "rencal-view-styles",
    transform(code, id) {
      if (view.css && id === entry) return `import ${JSON.stringify(tailwindCss)};\n${code}`
    },
    generateBundle: {
      // After Vite emits the stylesheet.
      order: "post",
      handler(_, bundle) {
        const hasCss = Object.keys(bundle).some((file) => file.endsWith(".css"))
        if (hasCss && !view.css) {
          this.error(`View "${view.id}" imports CSS; add css = "…" to its ${MANIFEST} entry`)
        }
      },
    },
  }
}
