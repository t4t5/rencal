import tseslint from "typescript-eslint"

// Only the two rules that CLAUDE.md used to state in prose; everything else is left to tsc.
export default tseslint.config(
  { ignores: ["dist/**", "src-tauri/**", "website/**", "src/rpc/bindings.ts"] },
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
