//! The tokio runtime backend work runs on (GPUI_PORT_PLAN.md D6, §3.2).
//!
//! `rencal-core` is tokio-based (reqwest, `notify`, watch channels). `main`
//! starts one multi-thread runtime and stores its handle here. Backend futures
//! run on it (`Tokio::handle(cx).spawn(…)`, or `spawn_blocking` for file IO);
//! UI code awaits the returned `JoinHandle` inside `cx.spawn` and
//! applies the result with `entity.update(cx, …)`. tokio's channels and join
//! handles are executor-agnostic, so awaiting them on GPUI's executor is fine.

use gpui_kit::{App, Global};
use tokio::runtime::Handle;
use tokio::task::JoinHandle;

pub struct Tokio(Handle);

impl Global for Tokio {}

impl Tokio {
    pub fn init(handle: Handle, cx: &mut App) {
        cx.set_global(Self(handle));
    }

    pub fn handle(cx: &App) -> &Handle {
        &cx.global::<Self>().0
    }

    /// Runs blocking IO (file reads, config writes) off the main thread.
    pub fn spawn_blocking<R>(cx: &App, f: impl FnOnce() -> R + Send + 'static) -> JoinHandle<R>
    where
        R: Send + 'static,
    {
        Self::handle(cx).spawn_blocking(f)
    }
}
