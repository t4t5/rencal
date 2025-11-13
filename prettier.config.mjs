/** @type {import("prettier").Config} */
const config = {
  semi: false,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 140,
  singleQuote: false,
  importOrderSeparation: true,
  importOrder: [
    '(.*)\\.(css)$',
    '^@/components/(.*)$',
    '^@/rpc/(.*)$',
    '^@/lib/(.*)$',
    '^@/assets/(.*)$',
    '^@/(.*)$',
    '(.*)\\.(svg)$',
    '(.*)\\.(png|jpg|jpeg|gif|webp)$',
    '^[./]',
  ],
  plugins: ['@trivago/prettier-plugin-sort-imports'],
}

export default config
