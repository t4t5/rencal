# Sequence

A calendar app crafted especially for Omarchy.

## Architecture

This is a Tauri application with a Rust backend and React frontend.

### Backend (Rust)

- `src-tauri/src/lib.rs` - Defines RPC procedures using taurpc
- `src-tauri/src/oauth.rs` - Google Calendar OAuth 2.0 authentication flow
- API methods are defined in the `Api` trait and implemented in `ApiImpl`
- TypeScript bindings are auto-generated to `src/rpc/bindings.ts`

### Frontend (React)

- `src/App.tsx` - Main React application entry point
- Communicates with Rust backend via taurpc generated bindings

## Rules

- After implementing a new feature, **ALWAYS** run "just check" to make sure the app compiles!

## Google Calendar Integration

Uses standalone OAuth 2.0 authentication - no central Sequence server required:

1. User clicks "Connect Google Calendar"
2. Temporary HTTP server spawns on `localhost:8080`
3. Browser opens Google's OAuth consent page
4. Google redirects back to localhost with authorization code
5. App exchanges code for access token using PKCE
6. App fetches calendar data directly from Google Calendar API

### OAuth Security Model

The OAuth client ID and secret are embedded in `src-tauri/src/google_oauth.rs`. This is standard for desktop apps (similar to Thunderbird) and is not a security vulnerability. The embedded credentials just identify the app to Google, while PKCE provides the actual security against token theft.
