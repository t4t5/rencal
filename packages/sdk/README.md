# renCal SDK

Build view plugins for [renCal](https://rencal.org): the plugin API's types, renCal's design tokens and a build command that needs no configuration.

```sh
pnpm add -D @rencomputer/rencal-sdk @types/react
```

```json
{
  "scripts": { "build": "rencal-sdk build", "dev": "rencal-sdk dev" }
}
```

```json
// tsconfig.json
{ "extends": "@rencomputer/rencal-sdk/tsconfig.json" }
```

A view is a React component, default-exported from `src/index.tsx` (or `src/<view-id>.tsx` when a plugin has several views), that reads events, settings and navigation through hooks:

```tsx
import { useEventProps, useEventsInRange, useToday } from "@rencomputer/rencal-sdk"
```

`rencal-sdk build` type-checks the plugin and builds each view declared in `rencal-plugin.toml` to the `script` and `css` paths it names. renCal provides React, Temporal and this package at runtime, so the build leaves them out. Tailwind classes work out of the box against renCal's design tokens. `rencal-sdk dev` rebuilds on every change.

See the [plugin documentation](https://github.com/t4t5/rencal/blob/main/src-tauri/src/plugins/README.md#views) and [rencal-view-board](https://github.com/t4t5/rencal-view-board) for a complete plugin.
