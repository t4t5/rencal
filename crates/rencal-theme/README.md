# renCal themes (format v2)

A theme file is a **theme family**: one JSON file with one or more variants. Each variant sets tokens in a flat map of dotted keys; everything it leaves out is derived. Editors validate against the schema at `https://rencal.org/schema/themes/v1.json` (committed as `schema/v1.json`).

```json
{
  "$schema": "https://rencal.org/schema/themes/v1.json",
  "name": "Midnight",
  "author": "you",
  "themes": [
    {
      "name": "Midnight",
      "appearance": "dark",
      "style": {
        "background": "#0f0f0f",
        "text": "#eaeaea",
        "primary": "#7c3aed",
        "surface.tint": "#ffffff",
        "radius": 6
      }
    }
  ]
}
```

- Keys are flat, dotted, snake_case. Unknown keys and invalid values are ignored and reported in **Settings → Themes**; a theme never fails to load because of one bad key.
- Colours are `#RGB`, `#RRGGBB` or `#RRGGBBAA`. `null` means "unset, use the derived value".
- Lengths are numbers in pixels. `surface.tint_step` is a number from 0 to 1.
- `appearance` is `light` or `dark`. It decides which slots list the theme and which baseline fills in unset primitives.

Theme ids: a built-in family with one variant uses its file name (`nord`); a family with several uses each variant's slugified name (`ren`, `ren-light`). User themes in `~/.config/rencal/themes/*.json` are `user:<slug>`.

## How tokens resolve

For every token: the theme's value → its derivation rule → the baseline theme of the same appearance (`ren` for dark, `ren-light` for light). In practice `background`, `text`, `surface.tint` and `primary` get you most of a theme; surfaces, borders, hover states and muted text follow.

The surface tint system: most surfaces mix a number of `surface.tint` steps (`surface.tint_step` each) into transparent, or into `background` for solid surfaces, never into another surface, so overriding one token leaves the rest alone. `element.hover` is the exception: one step over `element.background`.

## Tokens

### Colours

| Token                                                                                          | Default                                                               |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `background`, `text`, `primary`                                                                | baseline                                                              |
| `surface.tint`                                                                                 | `text`                                                                |
| `surface.tint_step`                                                                            | baseline (`0.05`; `0.04` on ren-light)                                |
| `text.muted`                                                                                   | `text` at 50% alpha                                                   |
| `text.placeholder`                                                                             | `text.muted`                                                          |
| `surface.background`                                                                           | 1 step over `background` (cards)                                      |
| `surface.text`, `surface.text.muted`                                                           | `text`, `text.muted`                                                  |
| `elevated_surface.background`                                                                  | 1 step over `background` (popovers, menus)                            |
| `elevated_surface.text`, `elevated_surface.text.muted`                                         | `text`, `text.muted`                                                  |
| `sidebar.background`                                                                           | `background`                                                          |
| `tooltip.background`                                                                           | 15% `surface.tint` over `background`                                  |
| `tooltip.text`, `tooltip.text.muted`                                                           | `text`, `text.muted`                                                  |
| `toast.background`                                                                             | dark: `elevated_surface.background`; light: `text` (inverted)         |
| `toast.text`                                                                                   | dark: `elevated_surface.text`; light: `background`                    |
| `toast.text.muted`                                                                             | `toast.text` at 60%                                                   |
| `overlay`                                                                                      | `#00000080`                                                           |
| `border`                                                                                       | 3 steps                                                               |
| `border.input`                                                                                 | 4 steps                                                               |
| `border.focused`                                                                               | baseline (focus rings)                                                |
| `button.border`                                                                                | transparent                                                           |
| `ghost_element.hover`                                                                          | 1 step (content hover; no paired text colour)                         |
| `element.background`, `element.hover`                                                          | 1 step; 1 step over `element.background` (secondary buttons)          |
| `element.text`, `element.text.muted`                                                           | `text`, `text.muted`                                                  |
| `element.highlight` (+ `.text`, `.text.muted`)                                                 | 3 steps: transient highlight for menus, keyboard focus, ghost buttons |
| `element.selected` (+ `.text`, `.text.muted`)                                                  | 4 steps: persistent selection                                         |
| `element.muted`                                                                                | 1 step (static de-emphasised surface)                                 |
| `control.active.background`, `control.active.border`                                           | `element.background`, transparent (focused or open inputs)            |
| `primary.hover`                                                                                | `surface.tint_step` of white over `primary`                           |
| `primary.text`                                                                                 | `background`                                                          |
| `today`, `today.text`                                                                          | `primary`, `primary.text`                                             |
| `brand`, `brand.hover`, `brand.text`                                                           | `primary`, white step over `brand`, `background`                      |
| `weekend.background`                                                                           | `ghost_element.hover`                                                 |
| `success`, `warning`, `error`                                                                  | baseline                                                              |
| `error.hover`, `error.text`                                                                    | white step over `error`, white                                        |
| `event.color`                                                                                  | unset; when set, paints every event in this one colour                |
| `event.background`, `event.text`                                                               | unset; solid fill and its text for filled event blocks                |
| `event.tint_surface`                                                                           | `background`; what calendar colours are mixed into for event fills    |
| `scrollbar.thumb.background`, `scrollbar.thumb.hover_background`, `scrollbar.track.background` | `border`, `border.input`, transparent                                 |
| `week_grid.hour_line`, `week_grid.half_hour_line`                                              | `border`, transparent                                                 |
| `bevel.highlight`, `bevel.light`, `bevel.shadow`, `bevel.dark`                                 | white 80% / 40%, black 40% / 80% over `background`                    |

Event text and fills derive from each event's colour: on dark themes a chroma-boosted colour mixed into `text`, on light themes the colour with its lightness capped. The formula is internal.

The fill text colours (`primary.text`, `today.text`, `brand.text`, `error.text`) default to pairings that suit dark backgrounds; light themes should set them and check contrast.

### Metrics and typography

| Token                                                                         | Default                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `radius`                                                                      | baseline (`0`); rounded steps multiply it (sm ×0.6 … 4xl ×2.6)                    |
| `radius.circle`                                                               | `radius × 1000`: square when `radius` is 0, a pill otherwise                      |
| `control.height`                                                              | `34`; `.xs` −10, `.sm` −2, `.lg` +6. 24 is the supported minimum                  |
| `control.padding_x`, `control.gap`, `control.row_gap`, `control.leading_size` | `8`, `8`, `4`, `16` (event field rows)                                            |
| `control.trailing_inset`                                                      | `(control.height − control.height.xs) / 2 − 1`                                    |
| `layout.padding`                                                              | `12`                                                                              |
| `nav.padding_x`                                                               | `max(0, layout.padding − 8)`                                                      |
| `month.padding_x`, `event.padding_x`                                          | `4`                                                                               |
| `month.lane_height`                                                           | `text.scale.xs.line_height + 4`                                                   |
| `scrollbar.width`                                                             | `0` (hidden)                                                                      |
| `font.body`, `font.mono`                                                      | baseline font lists, first available wins: `["Pixelated MS Sans Serif", "Arial"]` |
| `font.heading`, `font.button`, `font.numerical`                               | `font.mono`                                                                       |
| `text.scale.<2xs\|xs\|sm\|base\|lg\|xl\|2xl>.size`, `.line_height`            | 11/14, 12/16, 14/20, 16/24, 18/28, 20/28, 24/32                                   |
| `typography.<heading\|button\|numerical>.size`, `.line_height`                | the `lg`, `sm`, `xs` scale step                                                   |
| `typography.<role>.weight`                                                    | unset (component default)                                                         |
| `typography.<role>.transform`                                                 | `none` or `uppercase`; baseline `uppercase`                                       |

### Style tokens

For looks colours can't express (Windows 98 bevels, skeuomorphic gradients), a theme can style component slots directly: `<slot>[.<state>].<property>`.

Slots: `button`, `button.primary`, `control`, `popover`, `dialog`, `dialog.title_bar`, `toast`, `tabs.list`, `tabs.tab`, `toolbar.main`, `toolbar.sidebar`, `event.timed`, `event.all_day`, `month.day`, `minical.day`, `agenda.row`, `scrollbar`, `week_grid`.

States: `hover`, `active`, `selected`, `open`, `today`, `disabled`. A state inherits whatever it doesn't set from the slot.

| Property                        | Value                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `fill`                          | a colour, or `{ "gradient": { "angle": 180, "from": "#fff", "to": "#ccc" } }`                                            |
| `text`, `border`                | colour                                                                                                                   |
| `border_width`, `radius`, `gap` | px                                                                                                                       |
| `border_style`                  | `solid`, `bevel_raised`, `bevel_sunken`, `bevel_raised_double`, `bevel_sunken_double` (bevels use the `bevel.*` colours) |
| `shadow`                        | list of `{ "x", "y", "blur", "spread", "color", "inset" }`; `[]` removes the default                                     |
| `text_shadow`                   | `{ "x", "y", "color" }`                                                                                                  |

```json
"button.border_style": "bevel_raised_double",
"button.active.border_style": "bevel_sunken_double",
"button.fill": "#c0c0c0",
"tabs.list.gap": 6,
"tabs.list.shadow": []
```

Some colour tokens double as a slot property: `toast.text`, `button.border` and `control.active.border` are the same values as those slot keys.

## Converting a CSS theme

Themes in the old CSS format (a bare block of `--var: value;` declarations) convert with the theme builder on the website, or locally:

```sh
cargo run -p rencal-theme --features legacy-css --example convert-legacy -- dark "My Theme" my-theme.css > my-theme.json
```

The converter evaluates the CSS exactly as the old app did and writes the smallest JSON theme that looks the same. Custom selector rules (`[data-slot="…"] { … }`) can't be converted; it reports them so you can re-create them with style tokens.

## Omarchy

On an Omarchy desktop the `omarchy` theme is built from the desktop palette (`omarchy_theme`): it sets the primitives (`background`, `text`, `primary`, `today`, `brand`, status colours, readable fill text) and derivation does the rest. Single-hue Omarchy themes (Vantablack, White, Solitude, Lumon) get the Electric Blue treatment: the accent everywhere, and every event a solid accent fill.
