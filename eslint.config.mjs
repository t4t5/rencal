import tseslint from "typescript-eslint"

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
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Use an absolute `@/` import; only `./Sibling` relative imports are allowed.",
            },
          ],
        },
      ],
    },
  },
)
