//! Binary to generate TypeScript bindings without running the full Tauri app.
//! Run with: cargo run --bin gen_types

use rencal_lib::create_router;

#[tokio::main]
async fn main() {
    // Creating the router and calling into_handler triggers taurpc type generation
    let router = create_router();
    let _ = router.into_handler();
    println!("TypeScript bindings generated successfully!");
}
