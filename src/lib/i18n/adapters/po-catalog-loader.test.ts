import { expect, it } from "vitest"

import { PoCatalogLoader } from "./po-catalog-loader"

it("loads a compiled catalog for every configured language", async () => {
  const loader = new PoCatalogLoader()
  await expect(loader.load("de")).resolves.toBeTypeOf("object")
  await expect(loader.load("en")).resolves.toBeTypeOf("object")
})

it("rejects a language without a catalog", async () => {
  await expect(new PoCatalogLoader().load("xx")).rejects.toThrow()
})
