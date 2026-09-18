import tseslint from "typescript-eslint"

// Import boundaries. Rules do not merge, so every block restates the full list.
const parentImports = {
  group: ["../*"],
  message: "Use an absolute `@/` import; only `./Sibling` relative imports are allowed.",
}
const rpcProxy = {
  name: "@/rpc",
  message: "Call the `rencal` client from `@/lib/api` instead of the raw RPC proxy.",
}
const generatedTypes = {
  group: ["@/rpc/*"],
  message:
    "Use supported types from `@/lib/api`; generated RPC types stay in the boundary modules.",
}
const nativeEvents = {
  group: ["@tauri-apps/api/event"],
  message: "Use `rencal.notifications` from `@/lib/api` for app notifications.",
}
const apiImplementations = {
  group: ["@/lib/api/*", "!@/lib/api/internal"],
  message:
    "Use the public `@/lib/api` entry point. Host orchestration may use `@/lib/api/internal`.",
}

// The transport and the app API facade may use the generated proxy directly.
const rpcBoundary = ["src/rpc/**", "src/lib/api/**"]
// Pure conversion modules translate generated types into app types.
const rpcTypeConverters = [
  "src/lib/cal-events.ts",
  "src/lib/cal-events.test.ts",
  "src/lib/conference.ts",
  "src/lib/event-time/rpc.ts",
]
// Only the notification adapter and its tests touch Tauri's event bus.
const appEventTransport = [
  "src/lib/api/notifications.ts",
  "src/lib/api/notifications.test.ts",
  "src/lib/api/notifications.transport.test.ts",
]

const restrictImports = ({ paths = [], patterns }) => ({
  "no-restricted-imports": ["error", { paths, patterns }],
})

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "website/**",
      "src/rpc/bindings.ts",
      "src/rpc/events.generated.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      ...restrictImports({
        paths: [rpcProxy],
        patterns: [parentImports, generatedTypes, nativeEvents, apiImplementations],
      }),
    },
  },
  {
    files: rpcTypeConverters,
    rules: restrictImports({ paths: [rpcProxy], patterns: [parentImports, nativeEvents] }),
  },
  {
    files: rpcBoundary,
    rules: restrictImports({ patterns: [parentImports, nativeEvents] }),
  },
  {
    files: appEventTransport,
    rules: restrictImports({ patterns: [parentImports] }),
  },
)
