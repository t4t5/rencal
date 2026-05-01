import type { Rule } from "eslint"
import { defineConfig, globalIgnores } from "eslint/config"
import tseslint from "typescript-eslint"

import { mustUseResult } from "./eslint-rules/must-use-result"
import { noBarePromise } from "./eslint-rules/no-bare-promise"

// `RuleCreator` from @typescript-eslint/utils produces a tighter
// `RuleContext` than ESLint core's `Rule.RuleModule`. They're
// structurally compatible at runtime; the cast bridges the type gap.
const localPlugin = {
  rules: {
    "must-use-result": mustUseResult as unknown as Rule.RuleModule,
    "no-bare-promise": noBarePromise as unknown as Rule.RuleModule,
  },
}

export default defineConfig([
  globalIgnores(["dist", "src-tauri/target", "src/rpc/bindings.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    plugins: { local: localPlugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // "@typescript-eslint/no-floating-promises": "error",
      // "@typescript-eslint/no-misused-promises": "error",
      "local/must-use-result": "error",
      "local/no-bare-promise": "error",
    },
  },
])
