# View registry plan

Replace the hardcoded view lists with one registry, so that week, month and board are registered the same way a plugin view will be. This is the first step towards view plugins: after it, a built-in year view is a registry entry plus a component, and nothing else in the app needs to change.

## Goals

- One list of views drives the main area, the view dropdown, keyboard shortcuts, the shortcuts overlay and the command palette.
- View ids are open strings. An unknown id (a stored preference for a view that no longer exists, or a plugin view that hasn't loaded yet) falls back to month instead of failing.
- Consumers read views through a hook, so the registry can become dynamic later without touching them.

## Non-goals

- Moving board to `src/plugins/board/` or restricting it to a plugin API. That's the next step and gets its own plan.
- A general command registry. Static commands keep the closed `ShortcutId` union and their exhaustive handler `Record`. Only view-switching commands become dynamic.
- Settings pages registry, plugin loader, `contributes.views` in the manifest.
- Building the native macOS menu from the frontend. See [Native menu](#native-menu).
- Changing how month and week work internally. They keep their `@/` imports.

## Current state

The view list is hardcoded in seven places:

| Where                                          | What                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/calendar-view.ts`                     | `z.enum(["week", "month", "board"])`, the `CalendarView` type and `CALENDAR_VIEW_KEY` |
| `src/components/main/Main.tsx`                 | One literal `TabsContent` per view; `calendarViewSchema.parse` on tab change          |
| `src/components/main/MainHeader.tsx`           | `CALENDAR_VIEW_OPTIONS` (id, name, displayed shortcut letter)                         |
| `src/lib/shortcuts.ts`                         | `month`, `board`, `week` entries in `SHORTCUTS` (so they're in `ShortcutId`)          |
| `src/components/shortcuts/GlobalShortcuts.tsx` | `month`/`week`/`board` handlers in the exhaustive `Record<ShortcutId, …>`             |
| `src/lib/palette-commands.ts`                  | `month`, `week`, `board` entries in `PALETTE_COMMANDS`                                |
| `src-tauri/src/menu.rs`                        | `Week`/`Month`/`Board` items with ids `week`/`month`/`board` and `CmdOrCtrl+1/2/3`    |

`useCalendarView` (`src/hooks/useCalendarView.ts`) persists the active id in localStorage under `calendarView` and parses it with the zod enum, defaulting to `"month"`. Views take no props and read everything from contexts, so they already have the shape a registry entry needs.

## Design

### The descriptor

New directory `src/views/`, mirroring `src/themes/` (`manifest.ts` holds `ThemeDescriptor` and `BUILTIN_DESCRIPTORS`; `ThemeRegistry.tsx` exposes them).

```ts
// src/views/manifest.ts
export type ViewDescriptor = {
  id: string
  name: string
  component: ComponentType
  // Single character that shows this view. Also shown in the view dropdown.
  shortcut?: string
}

export const DEFAULT_VIEW_ID = "month"

export const BUILTIN_VIEWS: ViewDescriptor[] = [
  { id: "week", name: "Week", component: WeekView, shortcut: "w" },
  { id: "month", name: "Month", component: MonthView, shortcut: "m" },
  { id: "board", name: "Board", component: BoardView, shortcut: "b" },
]

export function resolveView(id: string, views: readonly ViewDescriptor[]): ViewDescriptor
```

- Array order is display order everywhere (dropdown, palette, overlay). Today the dropdown says week/month/board and the palette says month/week/board; both become week/month/board.
- `resolveView` returns the matching view, else the default, else the first view.
- Built-in ids stay `week`, `month`, `board`. They are the values already stored in users' localStorage and the ids the native menu emits, so no migration is needed. Plugin views will later get `<plugin-id>/<view-id>`; the `/` keeps them from ever colliding with a built-in id.

### `useViews`

```ts
// src/views/useViews.ts
export const useViews = (): readonly ViewDescriptor[] => BUILTIN_VIEWS
```

It returns a static list for now. It's still a hook, so that when plugin views register at runtime this becomes a context or store subscription and no caller changes. All consumers below use it rather than importing `BUILTIN_VIEWS`.

### Active view

- `useCalendarView` stores a plain string: `z.string()` instead of the enum, default `DEFAULT_VIEW_ID`. `CALENDAR_VIEW_KEY` moves into the hook file. `src/lib/calendar-view.ts` is deleted.
- The fallback is applied when rendering (`resolveView(calendarView, views)`), not when reading storage, and the stored value is never rewritten by the fallback. This matters later: a user whose last view was a plugin view keeps that preference through a launch where the plugin fails to load or loads late.
- `onChangeCalendarView` and friends take `string`.

### Main area

`Main.tsx` maps over `useViews()`:

```tsx
const active = resolveView(calendarView, views)

<Tabs value={active.id} onValueChange={onChangeCalendarView} …>
  <MainHeader activeView={active} onChangeCalendarView={onChangeCalendarView} />
  <div data-slot="main-viewport" …>
    {views.map(({ id, component: View }) => (
      <TabsContent key={id} value={id} className="h-full">
        <View />
      </TabsContent>
    ))}
  </div>
</Tabs>
```

`MainHeader`'s `CalendarViewDropdown` maps over `useViews()` and shows `shortcut?.toUpperCase()`. `CALENDAR_VIEW_OPTIONS` is deleted.

### Shortcuts and commands

View-switching commands are derived from the registry. The command that shows a view has the view's id as its own id, which is what the native menu already sends.

- Remove the `month`, `board` and `week` entries from `SHORTCUTS`. `ShortcutId` loses them, so the static handler `Record` no longer needs them.
- Add `viewShortcuts(views): ShortcutDef[]` in `src/views/manifest.ts`: for each view with a `shortcut`, `{ id: view.id, group: "View", label: \`Display ${name.toLowerCase()} view\`, bindings: [{ keys: shortcut, type: "char" }] }`. The labels match the current ones.
- Add `useShortcutDefs()` returning `[...viewShortcuts(views), ...SHORTCUTS]`. Views first means they lead the View group in the overlay, as they do now. `ShortcutsOverlay`, `CommandPalette`'s `SHORTCUT_BY_ID` and the binding hosts in `GlobalShortcuts` read this instead of `SHORTCUTS`.
- In `GlobalShortcuts`, build `viewHandlers` from the registry (`id → () => onChangeCalendarView(id)`) and merge them with the static handlers into a `Record<string, ShortcutHandler>` used for bindings, the palette and the `menu-action` listener. `lockBackground` applies to the merged map, so view switching stays locked while an event is open, as it is today. `LOCKED_WHILE_EVENT_OPEN` is computed from the merged defs.
- `useShortcutHandlers` keeps returning `Record<ShortcutId, ShortcutHandler>`, so static commands keep their exhaustiveness check.

### Command palette

- Remove the three view entries from `PALETTE_COMMANDS`.
- `CommandPalette` takes `commands: readonly PaletteCommand[]` instead of reading `PALETTE_COMMANDS` directly. `GlobalShortcuts` builds it by inserting `views.map((v) => ({ id: v.id, group: "View" }))` before the static View entries, so the view commands keep their place above "Toggle week numbers".
- `PaletteCommand.id` and the palette's `handlers` become `string`-keyed. `PaletteCommandId` goes away; the static extra (`toggle-week-numbers`) stays typed where `paletteHandlers` is built.

### Native menu

`menu.rs` stays static for now. Its `week`/`month`/`board` ids already match the registry, and unknown menu ids are already ignored on the frontend. A built-in year view will add a `CmdOrCtrl+4` item there by hand.

A menu built from a frontend spec (a `set_view_menu` RPC that rebuilds the View submenu) only becomes necessary when third-party views can load. It belongs with the plugin loader, not here.

## Steps

Each step leaves `just check` and `just test` green.

1. **Registry module.** Add `src/views/manifest.ts` (`ViewDescriptor`, `BUILTIN_VIEWS`, `DEFAULT_VIEW_ID`, `resolveView`, `viewShortcuts`) and `src/views/useViews.ts`. Unit tests for `resolveView` (known id, unknown id, default missing) and `viewShortcuts`.
2. **Active view and main area.** Switch `useCalendarView` to `z.string()`, move `CALENDAR_VIEW_KEY`, delete `src/lib/calendar-view.ts`. Rewrite `Main.tsx` and `MainHeader.tsx` to map over `useViews()`. Change `CalendarView` types on `AppWindow`, `Main`, `MainHeader` and `GlobalShortcuts` props to `string`.
3. **Shortcuts.** Remove the view entries from `SHORTCUTS`, add `useShortcutDefs`, merge view handlers in `GlobalShortcuts`, and switch `ShortcutsOverlay` and the binding hosts to the derived defs.
4. **Palette.** Remove the view entries from `PALETTE_COMMANDS`, pass `commands` into `CommandPalette`, loosen the id types.
5. **Guard tests.**
   - No two shortcut defs share an id, and no two bindings share keys (static and view-derived together). This catches a future view taking `t` or `s`.
   - Every view id in `menu.rs`'s View submenu is a registered view. Read the file as text, as `src/global-css.test.ts` does with CSS.
6. **Manual pass** (`just debug`): switch views via dropdown, `w`/`m`/`b`, palette and, on macOS, `Cmd+1/2/3`. Set `localStorage.calendarView = '"nope"'`, reload, and confirm month renders and the stored value is unchanged. Open an event and confirm `w`/`m`/`b` are locked. Check that the overlay and palette show the views in week/month/board order.

## What this enables

Adding a view becomes one `BUILTIN_VIEWS` entry, plus a `menu.rs` line for macOS. The next plans are:

- **Board as a built-in plugin**: move it to `src/plugins/board/`, introduce the plugin API module, and add an eslint rule that bans other `@/` imports under `src/plugins/**`.
- **Year view**: built against that API. It raises questions this plan deliberately leaves open: how navigation shortcuts (`h`/`j`/`k`/`l`, `ctrl+d`/`ctrl+u`) behave per view, a range-based `useEventsInRange` that can load a whole year, and a way to open another view at a given date (click a day → week).
