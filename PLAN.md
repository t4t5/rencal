# Plan: one failing calendar must not block sync for the others

Refs https://github.com/t4t5/caldir/issues/78 (the "confirmed impact is wider" comment).

## Problem

One Fastmail calendar with a malformed CalDAV resource stopped every other calendar (including iCloud) from syncing in renCal. `caldir sync` in the CLI doesn't have this problem because it reports each calendar's error and moves on.

Root cause: every route that loops over `state.caldir().connections()` uses `?` inside the loop, so the first failing calendar aborts the whole request:

- `src-tauri/src/routes/caldir/sync_preview.rs`: this is the actual blocker. `SyncContext.runSync` calls `sync.preview()` first, so a throw there means `sync.run()` is never called.
- `src-tauri/src/routes/caldir/sync.rs`
- `src-tauri/src/routes/caldir/discard.rs`
- `src-tauri/src/routes/caldir/helpers.rs` (`pull_created_calendar_events`): after connecting an account, one bad calendar skips the initial pull for the rest. The error is only logged.

The UI also has only a single `syncError: string`, so it can't say which calendar failed.

## Goal

- Each calendar succeeds or fails on its own. Healthy calendars always pull and push.
- The failures are sent back to the frontend per calendar, and the toolbar shows which calendars failed and why.
- A route returns `Err` only when the whole request is broken. A single calendar failing is not that.

## Backend

### Types (`routes/caldir/types.rs`)

```rust
#[derive(Clone, Debug, Serialize, Type)]
pub struct SyncFailure {
    /// `None` when the calendar couldn't be loaded, so no slug is known.
    pub calendar_slug: Option<String>,
    pub error: RpcError,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct SyncPreviewResult {
    pub previews: Vec<SyncPreview>,
    pub failures: Vec<SyncFailure>,
}
```

Route signatures in `routes/caldir/mod.rs`:

- `sync_preview() -> TauResult<SyncPreviewResult>`
- `sync(allow_mass_delete) -> TauResult<Vec<SyncFailure>>`
- `discard() -> TauResult<Vec<SyncFailure>>`

### Loop rules

Apply these in every connection loop:

| Step fails                             | Record failure   | Then                                                                                     |
| -------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `connection?` (calendar/provider load) | yes, slug `None` | next calendar                                                                            |
| missing slug                           | yes, slug `None` | next calendar                                                                            |
| `diff`                                 | yes              | next calendar                                                                            |
| `apply_incoming_diff`                  | yes              | `invalidate_events(slug)` (core flushes partial pulls to disk), skip push, next calendar |
| `apply_outgoing_diff`                  | yes              | `invalidate_events(slug)` (partial pushes rewrite local files), next calendar            |

Skipping a calendar because of the mass-delete guard is not a failure; that behaviour stays as it is.

The per-calendar context (`[slug]`) currently goes into `RpcError.message`. Now that `calendar_slug` is its own field, don't also add it to the message; let the UI format it.

To keep the four loops consistent, add a small helper in `helpers.rs`, e.g. `fn connection_slug(&Connection) -> Result<String, RpcError>`. Don't build a generic async "for each connection" abstraction; the four loops differ enough that it wouldn't fit.

### `pull_created_calendar_events`

Use the same per-calendar `continue`, and log each failure with its slug. The caller in `connect_provider` can stay log-only.

## Frontend

### `src/lib/api/sync.ts`

- `getSyncPreview(): Promise<SyncPreviewResult>`
- `syncCalendars(...): Promise<SyncFailure[]>`
- `discardPendingChanges(): Promise<SyncFailure[]>`
- Re-export `SyncFailure`.

### `src/contexts/SyncContext.tsx`

- Add `syncFailures: SyncFailure[]` next to `syncError`. `syncError` stays for a whole-call rejection.
- `runSync`:
  - `const { previews, failures } = await api.sync.preview()`, then carry on with the calendars that have work even when `failures` isn't empty.
  - If `run` is called, its failures replace the preview's. `run` re-diffs every calendar, so its result is newer.
  - If `run` isn't called (no work, or `apply: false`), show the preview's failures.
  - Keep `reloadEvents()` after `run` even when there are failures, because healthy calendars changed.
- `confirmMassDelete` / `discardMassDelete`: set `syncFailures` from the returned list.
- Clear `syncFailures` at the start of each run, the same way `syncError` is cleared.

### `src/components/toolbar/SyncStatus.tsx`

- Show the warning icon when `syncError || syncFailures.length > 0`. The offline state still takes precedence.
- The tooltip lists one line per failure: `{calendarName(slug) ?? "Unknown calendar"}: {error.message}`. Reuse the `calendarName` lookup from `ChangesPreview`, and keep `max-w-64 wrap-break-word`.
- If there are also pending changes, show the failures above them.

## Tests

- Rust (`sync.rs` / `sync_preview.rs`): build `AppState::load_from` with `ProviderDirs { bundled: Some(tmp) }` and put stub provider scripts in `tmp`:
  - `caldir-provider-broken`: replies with an error to `list_events`.
  - `caldir-provider-ok`: replies with `[]`.
  - Create one calendar for each and assert that `sync_preview` returns one preview plus one failure (slug `broken`), and that `sync` returns `Ok` with one failure.
  - Cheaper fallback if stubs are awkward: two calendars pointing at a provider that doesn't exist. Assert two failures. Before the fix, the handler errors on the first one.
- Frontend: a `SyncContext` test where `preview` returns one failure plus one preview with work. Assert that `run` is still called and that `syncFailures` holds the failure.
- Update `src/lib/api/errors.test.ts` if the `sync` return type change affects it.

## Checklist

1. Backend types, then the routes.
2. `just gen-types`
3. Frontend api, context, toolbar.
4. `just check && just test`

## Out of scope (caldir side)

- Parsing the multi-UID resource itself: caldir branch `skip-malformed-ics-events`.
- `caldir-core` `push_outgoing_changes` stops at the first failing event, so one bad event still blocks the rest of that calendar's pushes. That is a separate core change.
