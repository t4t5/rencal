# Mikado graph: translatable UI (German first)

Goal at the top, prerequisites below. Only leaves are implemented; a red build means
revert the attempt and add the newly discovered prerequisite as a child node.

```
GOAL  renCal shows its UI in the user's language; a new language = one catalog file
├── [x] A  Localization context: Locale value object + negotiation (domain, pure)
├── [x] B  Ports: PreferredLocalesSource, CatalogLoader, LocaleActivator
│          + use case activateUserLocale (London-style tests with test doubles)
├── [x] C  Lingui infrastructure: deps, lingui.config, native macro transform, test setup
├── [x] D  Adapters: navigator source, compiled-catalog loader, lingui activator
├── [x] E  Bootstrap activates the locale before first render (main.tsx)
├── [x] F  Date display follows the active locale (#135)
│   ├── [x] F1 event-time display locale store (like the viewer-zone store)
│   ├── [x] F2 weekday/month names and full dates via Intl in the display locale
│   └── [x] F3 month-view weekday header, mini calendar, date picker
├── [ ] G  UI strings wrapped with `t` / `msg` (module-level → `msg`)
├── [ ] H  Catalogs: en (source) + de, extracted and compiled
├── [ ] I  Drift guard: test fails when code and catalogs disagree
└── [ ] J  Optional `language` override in config.toml (Rust + bindings)

Out of scope: native menu in src-tauri/src/menu.rs (macOS only), backend error texts.
```
