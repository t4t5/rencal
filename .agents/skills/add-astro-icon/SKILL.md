---
name: add-astro-icon
description: Turn raw SVG markup into an Astro icon component in website/src/icons/. Use when the user provides SVG markup and wants it added as a website Astro icon.
---

You are turning raw SVG markup the user provides into an Astro icon component in `website/src/icons/`.

## Workflow

1. **Get the SVG**: The user will give you raw SVG markup (often copy-pasted from Streamline, Figma, etc.).

2. **Pick a filename**: Use a short kebab-case name describing the icon (e.g. `settings.astro`, `arrow-right.astro`). Infer obvious icon names without asking. For common brand logos, use the brand name (e.g. GitHub → `github.astro`). Ask the user only if the name is truly ambiguous.

3. **Transform the SVG**:
   - Add this Astro frontmatter at the top:

     ```astro
     ---
     interface Props {
       class?: string
     }

     const { class: className } = Astro.props
     ---
     ```

   - On the `<svg>` tag: keep `xmlns`, `fill`, and `viewBox`. Add `class={className}`. **Remove** hardcoded `width` and `height` — size is controlled by Tailwind (`size-4`, `size-6`, etc.).
   - Replace every hardcoded stroke color (e.g. `stroke="#000000"`) with `stroke="currentColor"`. Same for `fill` if it's a color — but leave `fill="none"` alone. Brand icons that should inherit text color should use `fill="currentColor"`.
   - Strip noise: `id` attributes, `<desc>` tags, `<title>` tags, and any other vendor metadata.
   - Keep `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `d`, and other geometry-defining attributes. Preserve valid Astro/HTML attribute casing for SVG markup.

4. **Write the file** to `website/src/icons/<name>.astro` immediately. Use `bash` with a quoted heredoc instead of the `write` tool to avoid slow line-by-line UI rendering:

   ```bash
   cat > website/src/icons/<name>.astro <<'EOF'
   ...
   EOF
   ```

## Speed rules

- Do not inspect existing icon files unless necessary.
- Infer obvious icon names without asking.
- For common brand logos, use the brand name.
- Immediately write `website/src/icons/<name>.astro` after transforming.
- Prefer `bash` with a quoted heredoc for file creation; do not use the `write` tool unless bash is unavailable.
- Do not run checks unless the user asks.

## Example

Input:

```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" id="Foo" height="24" width="24">
  <desc>Some vendor blurb</desc>
  <g id="group"><path id="p1" stroke="#000000" d="M6 0v14" stroke-width="2" /></g>
</svg>
```

Output (`website/src/icons/foo.astro`):

```astro
---
interface Props {
  class?: string
}

const { class: className } = Astro.props
---

<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class={className}>
  <g>
    <path stroke="currentColor" d="M6 0v14" stroke-width="2" />
  </g>
</svg>
```

Usage: `<FooIcon class="size-4 text-primary" />` when imported with an alias, or import the `.astro` component directly and render it with `class="size-4 text-primary"`.
