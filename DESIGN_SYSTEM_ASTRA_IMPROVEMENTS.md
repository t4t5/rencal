# Design system improvements before release

Assessment of [PR #156: Revamp design system](https://github.com/t4t5/rencal/pull/156), reviewed at commit `eb656f0f9dc2023be2b95d08c1324b4069992de8`, alongside the Gruvbox and Windows 98 theme repositories.

## Recommendation

Make one more focused pass before merging and treating the theme contract as stable. The CSS-variable foundation, live theme loading, bundled fonts, shared control surfaces, and shadcn-style component slots are worth keeping. The highest-priority improvements are token correctness, consistent component metadata, and a coherent calendar-event styling contract.

Gruvbox demonstrates that palette-only themes are straightforward. Windows 98 demonstrates substantial customization, but also reveals dependencies on DOM structure and application behavior that theme authors should not need to understand.

shadcn provides editable component source, familiar tokens, and composition conventions. renCal must additionally define and maintain a stable external CSS API; adopting shadcn alone does not provide that compatibility guarantee.

## Changes to prioritize before release

### 1. Use semantic color tokens consistently

The PR correctly gives `--muted` its shadcn surface meaning and introduces `--muted-foreground` for text. Finish that alignment in component styles:

- Ghost buttons, select items, and command items currently combine `--hover` backgrounds with `--accent-foreground`.
- Navigation tabs combine `--secondary` backgrounds with `--accent-foreground`.
- Popovers use `--card` and `--card-foreground`, leaving the separate popover tokens ineffective for their outer surface.

Use matching background/foreground pairs throughout shared components. Keep renCal's derivation formulas as defaults, while respecting explicit semantic-token overrides. Map the standard sidebar tokens onto renCal's sidebar as well.

A palette with a navy accent and white accent text exposed white text over unrelated pale backgrounds in a Chromium probe. Matching token pairs is necessary for predictable shadcn-theme imports.

### 2. Correct font aliases and theme-scope inheritance

Role fonts are defined through aliases on `:root`, while external themes override `--font-sans` and `--font-mono` on `body[data-theme]`. Those aliases resolve before the theme overrides apply.

The browser probe confirmed that direct font utilities change, while body text retains the system font and headings/buttons retain Geist Mono. Windows 98 works around this by setting every role font explicitly.

- Recompute dependent font defaults at the theme scope.
- Define whether nested `data-theme` scopes reset defaults or inherit the enclosing theme. Currently, a nested scope can inherit control height while resetting radius.
- Correct the documented legacy `--mono` and `--sans` fallbacks: the current alias direction does not make old-name overrides affect the new consumers.

### 3. Standardize primitive metadata and composition

Keep standard, single-valued slots such as `button`, `select-trigger`, `input-group-addon`, and `dialog-title`.

- Emit `data-variant` and `data-size` on Button, including default values, as current shadcn does.
- Consider restoring the standard `outline` and `link` button variants to ease reuse of ecosystem components.
- Retain `data-button` as a persistent identity marker when composed triggers replace `data-slot`.
- Document that slots identify component parts, while additional attributes preserve identities and states through composition.
- Give components sharing a slot equivalent styling metadata. FastSheet and Sheet both expose `sheet-content`, but FastSheet lacks the corresponding open/closed state.

The existing `data-control-surface` abstraction is useful. Apply these conventions consistently across shared controls.

### 4. Establish one calendar-event styling contract

Event hooks currently vary across views:

- Month all-day events lack the highlighted attribute available on week events.
- Agenda timed-event styling and selection state live on different elements.
- Agenda all-day surfaces and board cards lack equivalent slots.
- Event titles lack a shared styling hook.
- Draft, RSVP, and drag states are largely implicit in classes and inline styles.

Consider a shared event slot with common child parts and explicit view/state attributes. For example, these proposed names would let themes style events once and specialize where necessary:

```html
<div
  data-slot="calendar-event"
  data-view="week"
  data-kind="timed"
  data-highlighted="true"
  data-rsvp="tentative"
>
  <span data-slot="calendar-event-title">…</span>
  <span data-slot="calendar-event-time">…</span>
</div>
```

Move event paint into CSS. JavaScript currently writes background, text color, borders, and shadows inline, preventing ordinary slot selectors from overriding them. Expose event colors through custom properties and state through attributes, then derive the visual treatment in CSS. Inline positioning can remain responsible for event geometry.

This is the strongest candidate for a deliberate naming change before external themes depend on the current structure.

### 5. Remove behavioral dependencies from visual styling

Windows 98 disables animations, then restores a `0.01ms` transition on a specific ancestor so draft-collapse cleanup receives `transitionend`. The application should finish that cleanup even when transitions are disabled.

Remove unnecessary visual restrictions such as month dates' forced `justify-end!` alignment. Document the actual geometry constraints separately.

Resolve the control-sizing inconsistency: documentation describes icon size as control height minus `4px`, but implementation subtracts `10px`. At the documented minimum control height of `24px`, `icon-sm` buttons become `14px` square. Separate icon dimensions from interactive target dimensions, or establish a consistent supported scale.

## Contract documentation and verification

Before release, publish a compact, versioned reference covering supported tokens, slots, attributes, composition rules, and layout constraints. Use the existing `min_rencal_version` field for compatibility requirements and define how future contract breaks will be handled.

Add a small component gallery and rendered-style checks covering:

- Gruvbox, Windows 98, and a standard shadcn palette with deliberately distinct card, popover, secondary, and accent colors.
- Composed triggers, focus, disabled/invalid controls, and open overlays.
- Event states across month, week, agenda, and board views.
- Theme switching, compact typography, font overrides, and disabled animations.

Include WebKit verification because it is the Linux app's renderer. The gallery should also serve as a development surface for theme authors.

Fix `components.json`: its CSS path still points to nonexistent `src/App.css` instead of `src/global.css`.

## Work that can follow the initial contract

Supported calendar-density controls can be added later. The existing read-only `--week-hour-height` measurement is useful, but configurable hour density must keep rendering, scrolling, and pointer-to-time calculations synchronized. Avoid promising arbitrary calendar geometry changes through CSS until those systems share a supported source of truth.

## Review validation

At the reviewed PR commit, `just check`, all 22 focused tests, and all four PR CI checks passed. Chromium probes confirmed the font-alias and color-pairing issues, demonstrating the need for rendered-style coverage. A full interactive WebKit review was not performed. The assessment did not modify application code.

## References

- [shadcn architecture and source ownership](https://ui.shadcn.com/docs)
- [shadcn theme tokens](https://ui.shadcn.com/docs/theming)
- [shadcn Button implementation](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/button.tsx)
- [shadcn configuration reference](https://ui.shadcn.com/docs/components-json)
- [Reviewed renCal theme documentation](https://github.com/t4t5/rencal/blob/eb656f0/src/themes/README.md)
