# Vortex

A visual design tool for CVA (Class Variance Authority) components, implemented as a Vite plugin.

## Concept

Vortex provides a visual interface for browsing and editing Tailwind classes in CVA-based components. Instead of manually editing class strings in code, designers and developers can see live previews of all component variants and modify their styles through a UI, with changes written back to the source files.

## Architecture

### Vite Plugin (`plugin.ts`)

The core of Vortex is a Vite plugin that:

1. **Serves the Vortex UI** - Redirects `/` to `/vortex.html`
2. **Provides API endpoints**:
   - `GET /api/cva-config?file=<path>` - Parses a file and returns its CVA configuration
   - `POST /api/update-classes` - Writes updated class strings back to source files
3. **Custom JSX runtime** - Intercepts `react/jsx-dev-runtime` to attach source location info to DOM nodes (for future element inspection features)

### CVA Parser (`parse-cva.ts`)

Uses TypeScript's compiler API to statically analyze source files and extract:

- Base classes from `cva()` calls
- Variant definitions (variant name → value name → classes)
- Line numbers for each class string (enabling precise source edits)
- Default variant values

### UI (`App.tsx`, `main.tsx`)

A React app that:

- Fetches CVA config from the API
- Displays a grid of all variant combinations with live component previews
- Shows a properties panel for the selected variant
- Allows editing class strings and saving back to source

## Data Flow

```
Source File (button.tsx)
    ↓ parse via TypeScript API
CVA Config (JSON)
    ↓ served via /api/cva-config
Vortex UI
    ↓ user edits classes
POST /api/update-classes
    ↓ regex replacement at specific line
Source File (updated)
```

## Future Ideas

- Element inspection using the custom JSX runtime's source location data
- Support for multiple components/files
- Undo/redo
- Class autocompletion from Tailwind config
