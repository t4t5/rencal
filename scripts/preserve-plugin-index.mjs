// Restore the deployed catalogue and its images, or validate a fresh artifact.
import { createHash } from "node:crypto"
import { mkdir, open, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const catalogUrl = "https://rencal.org/plugins.json"
const previewUrl = /^https:\/\/rencal\.org\/plugin-previews\/([0-9a-f]{64}\.png)$/
const indexLimit = 8 * 1024 * 1024
const imageLimit = 10 * 1024 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

async function download(url, limit) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    if (Number(response.headers.get("content-length")) > limit) {
      throw new Error(`Download exceeds ${limit} bytes`)
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error(`Download exceeds ${limit} bytes`)
      chunks.push(value)
    }
    return Buffer.concat(chunks, size)
  } finally {
    await reader.cancel()
  }
}

async function readBounded(path, limit) {
  const file = await open(path)
  try {
    if ((await file.stat()).size > limit) throw new Error(`${path} exceeds ${limit} bytes`)
    return await file.readFile()
  } finally {
    await file.close()
  }
}

function parseCatalog(data) {
  const entries = JSON.parse(data.toString("utf8"))
  if (
    !Array.isArray(entries) ||
    entries.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))
  ) {
    throw new Error("Catalogue must be an array of entries")
  }
  return entries
}

const [publicDirectory, mode] = process.argv.slice(2)
if (!publicDirectory || (mode !== undefined && mode !== "--local") || process.argv.length > 4) {
  throw new Error("Usage: node scripts/preserve-plugin-index.mjs <public-directory> [--local]")
}
const local = mode === "--local"
const indexPath = join(publicDirectory, "plugins.json")
let entries
if (local) {
  entries = parseCatalog(await readBounded(indexPath, indexLimit))
} else {
  try {
    entries = parseCatalog(await download(catalogUrl, indexLimit))
  } catch (error) {
    console.warn(`Could not restore deployed catalogue: ${error}; using checked-in catalogue`)
    entries = parseCatalog(await readBounded(indexPath, indexLimit))
  }
}

for (const entry of entries) {
  if (!("preview_url" in entry)) continue
  try {
    const match = typeof entry.preview_url === "string" && previewUrl.exec(entry.preview_url)
    if (!match || match[0] !== entry.preview_url) {
      throw new Error("Expected https://rencal.org/plugin-previews/<sha256>.png")
    }
    const filename = match[1]
    const destination = join(publicDirectory, "plugin-previews", filename)
    const data = local
      ? await readBounded(destination, imageLimit)
      : await download(entry.preview_url, imageLimit)
    if (!data.subarray(0, 8).equals(pngSignature)) throw new Error("Image is not PNG")
    if (createHash("sha256").update(data).digest("hex") !== filename.slice(0, -4)) {
      throw new Error("Image does not match its content hash")
    }
    if (!local) {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, data)
    }
  } catch (error) {
    console.warn(`${entry.id ?? "Plugin"}: omitting unavailable preview: ${error}`)
    delete entry.preview_url
  }
}

await writeFile(indexPath, JSON.stringify(entries, null, 2) + "\n")
