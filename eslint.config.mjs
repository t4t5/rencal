import tseslint from "typescript-eslint"

// Import boundaries. Rules do not merge, so every block restates the full list.
const parentImports = {
  group: ["../*"],
  message: "Use an absolute `@/` import; only `./Sibling` relative imports are allowed.",
}
const rpcProxy = {
  name: "@/rpc",
  message: "Call the app API in `@/lib/api/*` instead of the raw RPC proxy.",
}
const generatedTypes = {
  group: ["@/rpc/*"],
  message:
    "Use app-level types from `@/lib/api/*`, `@/lib/cal-events` or `@/lib/event-time`; generated RPC types stay in the boundary modules.",
}
const nativeEvents = {
  group: ["@tauri-apps/api/event"],
  message: "Use `listenAppEvent`/`emitAppEvent` from `@/lib/api/events` for app notifications.",
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
  "src/lib/api/events.ts",
  "src/lib/api/events.test.ts",
  "src/lib/api/events.transport.test.ts",
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
        patterns: [parentImports, generatedTypes, nativeEvents],
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
