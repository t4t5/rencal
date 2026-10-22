# renCal SDK

Build view plugins for [renCal](https://rencal.org). A view is a React component that renCal shows alongside its built-in week, month and year views. This package has the plugin API, renCal's design tokens for Tailwind, and a build command that needs no configuration.

## Setup

```sh
pnpm add -D @rencomputer/rencal-sdk @types/react @types/react-dom
```

Add the scripts to `package.json`:

```json
{
  "scripts": {
    "build": "rencal-sdk build",
    "dev": "rencal-sdk dev"
  }
}
```

And extend the shared `tsconfig.json`:

```json
{ "extends": "@rencomputer/rencal-sdk/tsconfig.json" }
```

## Declare the view

Views are declared in the plugin's `rencal-plugin.toml`:

```toml
id = "alice.upcoming"
name = "Upcoming"
description = "The next seven days as a list."
min_rencal_version = "0.9.0"

[[contributes.views]]
id = "upcoming"
name = "Upcoming"
script = "dist/upcoming.js"
css = "dist/upcoming.css"
```

`css` is optional; leave it out if the view has no styles. See [Create a plugin](https://rencal.org/docs/plugins/create/) for the rest of the manifest.

## Write the view

Default-export the component from `src/index.tsx`, or from `src/<view-id>.tsx` when the plugin has several views:

```tsx
import {
  type CalendarEvent,
  useEventProps,
  useEventsInRange,
  useToday,
} from "@rencomputer/rencal-sdk"

export default function UpcomingView() {
  const today = useToday()
  const events = useEventsInRange(today, today.add({ days: 7 }))

  return (
    <ul className="flex flex-col gap-1 p-4">
      {events.map((event) => (
        <EventItem key={event.key} event={event} />
      ))}
    </ul>
  )
}

function EventItem({ event }: { event: CalendarEvent }) {
  return (
    <li {...useEventProps(event)} className="rounded-md px-2 py-1">
      {event.summary}
    </li>
  )
}
```

Tailwind classes work out of the box and use renCal's theme, so views match whatever theme the user has installed.

## API

| Export                                                                                                                          |                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `useEventsInRange(start, end)`                                                                                                  | Events in visible calendars from `start` up to, not including, `end`                                           |
| `useEventProps(event)`                                                                                                          | Props that make an element behave like a renCal event: calendar color, selection, RSVP state and click to open |
| `useToday()`                                                                                                                    | Today's date, kept current across midnight and timezone changes                                                |
| `useViewerTzid()`                                                                                                               | The user's timezone, kept current when it changes                                                              |
| `useNavigation()`                                                                                                               | The active date, and a function to go to another date                                                          |
| `useCalendars()`                                                                                                                | The user's calendars                                                                                           |
| `useDisplaySettings()`                                                                                                          | The user's time format and first day of the week                                                               |
| `useEventSelection()`, `useEventAppearance(event)`                                                                              | The parts of `useEventProps` on their own                                                                      |
| `Temporal`                                                                                                                      | The Temporal API renCal uses for dates and times                                                               |
| `eventsByDay(events, start, end)`                                                                                               | Events grouped into one entry per day from `start` up to, not including, `end`, empty days included            |
| `dateInViewerZone`, `toViewerZonedDateTime`, `isAllDay`, `isSameDay`, `startOfWeek`, `epochDay`                                 | Date helpers                                                                                                   |
| `formatTime`, `formatWallclockTime`, `formatShortDate`, `formatLongDate`, `formatWeekday`, `formatMonth`, `getRelativeDayLabel` | Formatting that follows renCal's                                                                               |
| `Button`, `cn`, `ChevronLeftIcon`, `ChevronRightIcon`, `UntitledEventText`                                                      | Components and utilities from renCal's UI                                                                      |

React, Temporal and this package are provided by renCal at runtime. Other dependencies are bundled into the view.

## Build

`pnpm build` type-checks the plugin and writes each view to the `script` and `css` paths in its manifest. `pnpm dev` rebuilds on every change.

To try the plugin, add its directory to `~/.config/rencal/plugins.toml`. renCal reloads it on every rebuild:

```toml
plugins = ["~/dev/rencal-upcoming"]
```

A local plugin needs nothing else. Keep `dist/` out of git: it is build output.

## Publish

renCal installs a view plugin from its latest GitHub release, downloading each `script` and `css` file from the release asset with the same file name. Add a workflow that builds the plugin and attaches `dist/*` to a release whenever you push a version tag, as `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      attestations: write
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Build
        run: |
          npm ci
          npm run build

      - name: Attest build provenance
        uses: actions/attest@v4
        with:
          subject-path: dist/*

      - name: Create release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --generate-notes dist/*
```

Then push a tag such as `v0.1.0` to publish a release. The tag is the version renCal shows. See [rencal-view-board](https://github.com/t4t5/rencal-view-board) for a plugin set up with pnpm, and [Publish a plugin](https://rencal.org/docs/plugins/publish/) to list yours in the plugin directory.

## Source

The SDK is developed in the [renCal repository](https://github.com/t4t5/rencal/tree/main/packages/sdk).
