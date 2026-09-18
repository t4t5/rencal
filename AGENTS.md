# renCal Agent Guide

renCal is a Tauri v2 calendar app for Omarchy. Rust backend in `src-tauri/src/`, React frontend in `src/`, website and public docs in `website/`. Each of those directories has its own `AGENTS.md` with local conventions; procedures live in `.agents/skills/`.

## Commands

- `just typecheck`: frontend tsc + eslint + unused-export check
- `just check`: Rust check + clippy, then `just typecheck`
- `just test`: frontend + Rust tests, verifies `src/rpc/bindings.ts` is up to date
- `just gen-types`: regenerate TypeScript taurpc bindings from Rust
- `just debug [flags]`: run the app with `VITE_RENCAL_DEBUG` enabled

`.agents/hooks/post-edit.sh` runs tsc/eslint or `cargo check` for an edited file (wired up as a post-edit hook where the agent supports it). Run `just check` before handing work over.

## Conventions

- Use pnpm for dependencies.
- Frontend imports are absolute (`@/`); relative only for same-directory siblings. No `any`. Both are enforced by eslint.
