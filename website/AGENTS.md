# Website (Astro + Starlight + Tailwind v4)

- Standalone project with its own `package.json` / `pnpm-lock.yaml`; CI builds it with `pnpm install --frozen-lockfile --ignore-workspace`.
- Manage deps with `cd website && pnpm add --ignore-workspace <pkg>`. A plain `pnpm add` writes to the root lockfile because of the root `pnpm-workspace.yaml`, which breaks CI.
- Relative imports only (no `@/` alias). The `src/` frontend rules do not apply here.
