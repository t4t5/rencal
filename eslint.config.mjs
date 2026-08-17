import tsParser from "@typescript-eslint/parser"

const newDateRestriction = {
  selector: "NewExpression[callee.name='Date']",
  message:
    "Construct JS Date only at a third-party boundary; calendar days use Temporal.PlainDate.",
}

const dateFnsRestriction = {
  paths: [
    {
      name: "date-fns",
      message:
        "Import date-fns only at an approved boundary; use helpers from @/lib/event-time for calendar days.",
    },
  ],
  patterns: [
    {
      group: ["date-fns/*"],
      message:
        "Import date-fns only at an approved boundary; use helpers from @/lib/event-time for calendar days.",
    },
  ],
}

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-restricted-syntax": ["error", newDateRestriction],
      "no-restricted-imports": ["error", dateFnsRestriction],
    },
  },
  {
    files: [
      "src/lib/event-time/js-date.ts",
      "src/lib/magic-parser.ts",
      "src/lib/rrule-utils.ts",
      "src/components/sidebar/minical/Calendar.tsx",
      "src/components/ui/calendar.tsx",
      "src/components/ui/date-picker.tsx",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    files: [
      "src/lib/event-time/display.ts",
      "src/lib/magic-parser.ts",
      "src/components/sidebar/minical/Calendar.tsx",
      "src/components/ui/calendar.tsx",
      "src/components/ui/date-picker.tsx",
      "src/components/event-parts/inputs/ReminderSelect.tsx",
      "src/**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]

export default config
