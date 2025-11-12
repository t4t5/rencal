# Sequence

A calendar app crafted especially for Omarchy.

## Architecture

This is a Tauri application with a Rust backend and React frontend.

### Backend (Rust)
- `src-tauri/src/lib.rs` - Defines RPC procedures using taurpc
- API methods are defined in the `Api` trait and implemented in `ApiImpl`
- TypeScript bindings are auto-generated to `src/rpc/bindings.ts`

### Frontend (React)
- `src/App.tsx` - Main React application entry point
- Communicates with Rust backend via taurpc generated bindings
