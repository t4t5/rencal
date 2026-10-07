# rencal-text

Text logic (`GPUI_PORT_PLAN.md` §3.1, §5): the magic parser, recurrence rules, meeting and web links, contact suggestions, calendar groups and search ordering. Ports of `src/lib/{magic-parser,rrule-utils,recurrence-edit,conference,event-url,contact-suggestions,calendar-groups,search-results}.ts` and the pure parts of `RepeatSelect.tsx`. No GPUI, no IO. Builds on `rencal-time` (`EventTime`, `CalendarEvent`, `Recurrence`, `EventConference`).

## Layout

- `src/magic/`: the magic parser (see below).
- `src/recurrence/`: RRULE handling on rrule.js's terms.
  - `rule.rs`: `RRule`, an RRULE value with its parts in the order given (rrule.js `origOptions`), `FromStr` = `rrulestr`, `Display` = `toString()` (`RRULE:FREQ=…`), `value()` = the stored string without the prefix.
  - `text.rs`: `RRule::to_text`, rrule.js's English `toText()`.
  - `anchored.rs`: `RRule::anchor(dtstart)` → `AnchoredRule` (`createRRuleWithDtstart`), expanded by the `rrule` crate (`occurrences`, `first`).
  - `set.rs`: `RRuleSet` (rule + RDATE/EXDATE instants), the editor value, ↔ `Recurrence`.
  - `nearest.rs`: `with_nearest_occurrence`. `edit.rs`: `anchor_range_to_recurring_master`. `repeat.rs`: picker presets and label.
- `src/conference.rs`: meeting link detection, `EventLinks` (the link-bearing fields of an event or draft) with `has_video_meeting`/`meeting_url`, the join window, conference provisioning per calendar.
- `src/event_url.rs`: `find_urls`, `to_openable_url`, `EventLinks::detect_url`.
- `src/contacts.rs`: `Contact` (RPC shape), `suggest_contacts`, `is_valid_contact_email`.
- `src/calendar_groups.rs`, `src/search.rs`: group options/visibility, `prepare_search_results`.
- `tests/fixtures.rs`: golden fixtures from the TS implementation (`scripts/fixtures/text.fixtures.ts`), all but the magic parser's (`tests/magic_parser.rs`). `tests/recurrence.rs`, `tests/links.rs`: the ported vitest suites.

## Rules

- No globals: the viewer's zone, "now" and the stored active group are arguments.
- Recurrence expansion runs in rrule.js's "fake UTC": DTSTART, UNTIL and occurrences are wallclocks in the event's own zone (`NaiveDateTime`), so a 09:00 series stays at 09:00 across DST. Map results back through the event's `EventTime` (`add_days`), never by treating them as instants.
- Strings a user or the backend sees must match rrule.js: `RRule`'s `Display`, `AnchoredRule`'s `Display`, `RRuleSet`'s `Display` and `to_text`. The repeat picker selects a preset by comparing printed strings.
- Regexes mirror the JS patterns; keep character classes ASCII (`[A-Za-z0-9_-]`, not `\w`) where the JS ones were.

## Decisions

- Recurrences stay stored as `rencal_time::event::Recurrence` (caldir-core's shape: RRULE string + EXDATE/RDATE event times); this crate does not depend on caldir-core. Expansion uses the `rrule` crate (also caldir-core's expander). A differential run against rrule.js over 350 rule × DTSTART combinations matched except where noted below.
- `RRule::anchor` keeps `createRRuleWithDtstart`'s quirks because the fixtures pin them: monthly/yearly nth weekdays (`BYDAY=2TU`) and negative `BYMONTHDAY`s are dropped, as are `BYSETPOS`/`BYYEARDAY`/`BYWEEKNO`/`BYSECOND`, so a "2nd Tuesday" series lands on DTSTART's day of the month in search results. One deliberate difference: a rule whose `BYMONTHDAY`s are all negative (`FREQ=MONTHLY;BYMONTHDAY=-1`) expanded to every day of the month in rrule.js; here it falls back to DTSTART's day like the `2TU` case.
- Rules the `rrule` crate rejects (`BYMONTHDAY` on a weekly rule, out-of-range values) fail to expand, so `with_nearest_occurrence` returns the master unchanged; rrule.js expanded some of them. An UNTIL before DTSTART expands to nothing, as in rrule.js.
- `RRule` parsing is slightly more lenient than `rrulestr` (lowercase weekday codes, empty parts) and stricter on an unknown `WKST`; see `FromStr`.
- `RRuleSet` keeps one rule (the TS code only ever used `rrules()[0]`); RDATE/EXDATE are sorted, deduplicated instants and come back zoned in the viewer's zone.
- `EventLinks` replaces the TS `{ conference, location, … }` argument objects; `rpcToConference`/`conferenceToRpc` are serde.
- `normalize_calendar_groups` takes `(name, Option<slugs>)` pairs: the typed stand-in for dropping non-array config values.

## Magic parser

- `src/magic/mod.rs`: the event-level logic of `magic-parser.ts` (recurrence phrase, connector removal, location, segments). Its module docs are the grammar spec; `tests/magic_parser.rs` (the fixture corpus) is the executable spec.
- `src/magic/dates/`: a faithful port of the chrono-node 2.9 subset the app used (English casual, `forwardDate`), keeping chrono's architecture: `scan.rs` (pattern matchers), `components.rs` (known/implied fields, JS `Date` arithmetic), `lexicon.rs` (words, ordinals, units), `parsers.rs` + `time.rs` (parsers in chrono's order), `refiners.rs` (the refiner chain in chrono's order). Keep both orders.
- Patterns are hand-written candidate matchers in `scan.rs` that mirror the JS regexes alternative by alternative and yield candidates in backtracking order (greedy pieces longest first); the `regex` crate can't do the lookarounds. A pattern change must keep that order.
- `now` is the viewer's local wallclock; JS process-zone effects (DST gaps) resolve in the viewer's zone. Segment ranges are byte offsets.
- chrono quirks are reproduced on purpose (the fixtures pin them): forward-dating runs before range merging (`10am to noon` typed at 10:30 ends tomorrow), bare numbers are not times (`9-10`) but `at 9`/`from 2` are, a time in a DST gap drops the result, `the 25th`/`end of month` aren't recognised, and an overnight time range typed on a month's last day is dropped.
- Not ported: zone suffixes (`3pm PST`, `UTC+2`); they stay in the summary.
