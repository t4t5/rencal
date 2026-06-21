---
name: add-icon
description: Turn raw SVG markup into a React icon component in src/icons/. Use when the user provides SVG markup and wants it added as an icon.
---

You are turning raw SVG markup the user provides into a React icon component in `src/icons/`.

## Workflow

1. **Get the SVG**: The user will give you raw SVG markup (often copy-pasted from Streamline, Figma, etc.).

2. **Pick a filename**: Use a short kebab-case name describing the icon (e.g. `settings.tsx`, `arrow-right.tsx`). Infer obvious icon names without asking. For common brand logos, use the brand name (e.g. GitHub → `github.tsx`). Ask the user only if the name is truly ambiguous.

3. **Pick a component name**: PascalCase + `Icon` suffix (e.g. `SettingsIcon`, `ArrowRightIcon`, `GithubIcon`).

4. **Transform the SVG**:
   - Wrap it in `export const <Name>Icon = ({ className }: { className?: string }) => (...)`
   - On the `<svg>` tag: keep `xmlns`, `fill`, and `viewBox`. Add `className={className}`. **Remove** hardcoded `width` and `height` — size is controlled by Tailwind (`size-4`, `size-6`, etc.).
   - Replace every hardcoded stroke color (e.g. `stroke="#000000"`) with `stroke="currentColor"`. Same for `fill` if it's a color — but leave `fill="none"` alone.
   - Strip noise: `id` attributes, `<desc>` tags, `<title>` tags, and any other vendor metadata.
   - Keep `strokeWidth`, `strokeLinecap`, `strokeLinejoin`, `d`, and other geometry-defining attributes.

5. **Write the file** to `src/icons/<name>.tsx` immediately. Use `bash` with a quoted heredoc instead of the `write` tool to avoid slow line-by-line UI rendering:

   ```bash
   cat > src/icons/<name>.tsx <<'EOF'
   ...
   EOF
   ```

## Speed rules

- Do not inspect existing icon files unless necessary.
- Infer obvious icon names without asking.
- For common brand logos, use the brand name.
- Immediately write `src/icons/<name>.tsx` after transforming.
- Prefer `bash` with a quoted heredoc for file creation; do not use the `write` tool unless bash is unavailable.
- Do not run checks unless the user asks.

## Example

Input:

```
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" id="Foo" height={24} width={24}>
  <desc>Some vendor blurb</desc>
  <g id="group"><path id="p1" stroke="#000000" d="M6 0v14" strokeWidth={2} /></g>
</svg>
```

Output (`src/icons/foo.tsx`):

```tsx
export const FooIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
    <g>
      <path stroke="currentColor" d="M6 0v14" strokeWidth={2} />
    </g>
  </svg>
)
```

Usage: `<FooIcon className="size-4 text-primary" />`
