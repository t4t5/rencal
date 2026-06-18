import baseConfig from "../prettier.config.mjs"

/** @type {import("prettier").Config} */
const config = {
  ...baseConfig,
  plugins: [...(baseConfig.plugins ?? []), "prettier-plugin-astro"],
}

export default config
