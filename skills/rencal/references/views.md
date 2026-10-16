# View plugins

A view is a React component that renCal shows in the main area, alongside its month and week views. It lives in a plugin checkout with a `rencal-plugin.toml`, is built with [`@rencomputer/rencal-sdk`](https://www.npmjs.com/package/@rencomputer/rencal-sdk), and loads straight from the checkout.

## Location

Use the directory the user names. Otherwise create `~/.config/rencal/views/<name>/`, where `<name>` is a short kebab-case name for the view.

## Files

`rencal-plugin.toml`:

```toml
id = "local.agenda-grid"
name = "Agenda Grid"
description = "Today's events as a grid of cards"
min_rencal_version = "0.9.0"

[[contributes.views]]
id = "agenda-grid"
name = "Agenda Grid"
script = "dist/agenda-grid.js"
css = "dist/agenda-grid.css"
```

Keep `min_rencal_version = "0.9.0"`, the first release with views. The plugin ID is `<github-owner>.<name>`. Use the user's GitHub login when it is known (`gh api user --jq .login`), and `local.<name>` otherwise.

`package.json`:

```json
{
  "name": "rencal-view-agenda-grid",
  "private": true,
  "type": "module",
  "scripts": { "build": "rencal-sdk build", "dev": "rencal-sdk dev" },
  "devDependencies": { "@rencomputer/rencal-sdk": "^0.1.0", "@types/react": "^19.2.0" }
}
```

`tsconfig.json`:

```json
{ "extends": "@rencomputer/rencal-sdk/tsconfig.json" }
```

`.gitignore` holds `node_modules`. Keep `dist/` out of it: renCal loads the built files, and a published view ships them in the repository.

`src/index.tsx` default-exports the view component, which takes no props. A plugin with several views uses `src/<view-id>.tsx` for each.

## Writing the view

The SDK's types are its documentation. After installing, read `node_modules/@rencomputer/rencal-sdk/index.d.ts` before writing the component, and `theme.css` in the same package for the design tokens.

- Fetch events with `useEventsInRange(start, end)`. It returns events overlapping `[start, end)`, sorted by start. Ask only for the dates the view shows.
- Use the SDK's `Temporal` for dates, `useToday()` for today, and `useDisplaySettings()` for the user's time format and week start. An event's `firstDay` and `lastDay` are the days it covers in the user's time zone; prefer them, and `eventsByDay` for grouping, over computing day boundaries from `start` and `end`. Format dates and times with the SDK's `format*` helpers so they follow the user's settings.
- A view tied to a date, rather than to today, shows `activeDate` from `useNavigation()`, which follows renCal's Today button and other navigation. Paging controls inside the view call `goToDate`.
- Render each event in its own component and call the `useEventProps(event)` hook there, spreading its result on the event's element. That makes clicks open renCal's event popover, marks the selected event with `data-selected`, and sets theme colours as CSS variables without painting anything: use `bg-(--calendar-event-fill) text-(--calendar-event-foreground) data-selected:bg-(--calendar-event-selected-fill)` for a filled event, or give a child `data-slot="calendar-event-color-marker"` for a bar or dot in the calendar colour.
- Fill the main area: give the root element `h-full` and let it scroll with `overflow-auto` where content can overflow. Sticky elements need a background such as `bg-background`.
- Style with Tailwind classes against renCal's tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary/30` and others in `node_modules/@rencomputer/rencal-sdk/theme.css`) instead of fixed colours, so the view follows the user's theme. Tailwind classes only work when the manifest declares `css`. Inline styles can use the same tokens as `var(--primary)` and so on. Plain CSS files imported from `src/` work too.
- The view may import `react`, `react-dom` (`createPortal` and `flushSync` only) and the SDK, which renCal provides. Other npm packages are bundled into the script, which is limited to 2 MiB.

Views can read events and calendars, but cannot create or edit events, make network requests, or store settings through renCal. When a request needs one of these, tell the user what the view can do instead of working around it.

## Building and loading

1. Run `npm install`, or the user's package manager. If it finds no versions of `@rencomputer/rencal-sdk`, a release-age policy such as npm's `min-release-age` or pnpm's `minimumReleaseAge` is hiding a recent release; tell the user rather than changing their configuration.
2. Run `npm run build`. It type-checks the view and writes the files the manifest names. Fix every error it reports.
3. Add the checkout's path to the `plugins` array in `~/.config/rencal/plugins.toml`, e.g. `"~/.config/rencal/views/agenda-grid"`, keeping existing entries. Create the file with only that array if it does not exist. A running renCal loads the view immediately.

After that, every `npm run build` reloads the view in renCal. `npm run dev` rebuilds on every change, for a user editing the view themselves.

## Checking it

The view appears in the view menu and the command palette under its `name`. Manifest problems are listed in **Settings → Plugins**. A view that throws while rendering shows "The <name> view failed to load" and the error message in its place, which you cannot see: ask the user to open the view and tell you what it shows.

## Publishing

Only when the user wants to share the view: move it to a GitHub repository, change the ID's owner to the repository owner, commit `dist/`, and add the `rencal-plugin` topic. A view plugin installs from the default branch without a release.
