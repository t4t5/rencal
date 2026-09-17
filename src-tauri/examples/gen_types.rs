//! Binary to generate TypeScript bindings without running the full Tauri app.
//! Run with: cargo run --example gen_types

use std::sync::Arc;

use rencal_lib::create_router;
use rencal_lib::state::AppState;

#[tokio::main]
async fn main() {
    // A throwaway caldir config, so codegen never reads the developer's own.
    let tmp = tempfile::tempdir().expect("failed to create a temp dir");
    let state = AppState::load_from(tmp.path().join("config.toml"), None)
        .expect("failed to build app state");

    // Creating the router and calling into_handler triggers taurpc type generation
    let router = create_router(Arc::new(state));
    let _ = router.into_handler();
    println!("TypeScript bindings generated successfully!");
}
