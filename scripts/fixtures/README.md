# Golden fixtures for the GPUI port

`GPUI_PORT_PLAN.md` ports the TypeScript domain logic to Rust crates. Until cutover the TS code is the oracle: this generator runs the real TS implementations over fixed input corpora and writes JSON that the Rust ports are tested against. After cutover the fixtures are the spec.

## Regenerate

```sh
just fixtures
```

That runs `pnpm exec vitest run --config scripts/fixtures/vitest.config.ts`. The generator files are named `*.fixtures.ts`, so `pnpm test` / `just test` never pick them up. Output is deterministic: "now" is faked where code reads it, the viewer zone is set per case, and the process zone is pinned to `Europe/Berlin` (for the JS `Date` bridges into chrono-node and rrule.js). A rerun on another machine or date should produce no diff. If it does, the TS behaviour changed: review the diff, then commit the regenerated fixtures.

| Generator            | Writes to                              | Covers                                                                                                         |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `time.fixtures.ts`   | `crates/rencal-time/tests/fixtures/`   | `src/lib/event-time/*` (parsing, projections, dateInfo, days, display, edits, ranges, tz labels), load ranges  |
| `layout.fixtures.ts` | `crates/rencal-layout/tests/fixtures/` | week/month layout, all-day lanes, month grid, lane geometry, drag-to-reschedule, drag-to-create, week snap     |
| `text.fixtures.ts`   | `crates/rencal-text/tests/fixtures/`   | magic parser, recurrence (rrule.js), conference detection, links, contact suggestions, calendar groups, search |
| `app.fixtures.ts`    | `crates/rencal-app/tests/fixtures/`    | shortcuts table, command palette entries                                                                       |

## File shape

Every file has the same envelope:

```json
{
  "source": "src/lib/… (or a list of modules)",
  "description": "what the cases exercise, and any conventions",
  "cases": [{ "name": "unique within the file", "input": {}, "output": {} }]
}
```

- `input` has everything needed to reproduce the call. When one file mixes functions, `input.fn` names the function. `viewerTz` is the viewer's IANA zone, and `now` / `today` are fixed clock values.
- Event times use the RPC shape (`src/rpc/bindings.ts` → `RpcEventTime`, which matches caldir-core's serde form): `{ "kind": "date", "date" }`, `{ "kind": "datetime_utc", "instant" }`, `{ "kind": "datetime_floating", "wallclock" }`, `{ "kind": "datetime_zoned", "wallclock", "tzid" }`.
- Events are given as a compact spec (`id`, `start`, `end`, plus optional `calendar_slug` (default `"cal"`), `color`, `location`, `recurrence`, …). The full event is built with `rpcToCalendarEvent`, as in `shared.ts → makeEvent`.
- Epoch days are integers counting days since 1970-01-01. Instants are epoch milliseconds.
- A call that throws is recorded as `{ "error": "<message>" }`. Only the presence of the error is meaningful.
- Object keys inside `input`/`output` are sorted. Array order is significant.
- Text offsets (magic parser segments) are UTF-16 code units.

## Not captured

- `listTimeZones()`: depends on the JS engine's ICU zone list. The Rust port uses `chrono_tz::TZ_VARIANTS`.
- `useMonthGrid` reads settings/today from React context. Its loop is mirrored in `layout.fixtures.ts` around the exported `monthGridBounds` / `buildDay`.
- Calendar colours in layouts: they are CSS `var(--event-color, …)` strings in TS and are left out.
- Anything DOM-bound (hit-testing, scroll sessions, `startSnapFling` animation). Only the pure math is captured.
