/** @type {import('lint-staged').Configuration} */
export default {
  "*.{js,jsx,mjs,json,css,scss,html,md,yml,yaml}": "prettier --write",
  "*.{ts,tsx}": ["eslint", "prettier --write"],
}
