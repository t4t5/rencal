//! Background task supervision.

use std::future::Future;

/// `tokio::spawn` that logs instead of vanishing when the task panics.
pub fn spawn_task(name: &'static str, task: impl Future<Output = ()> + Send + 'static) {
    tokio::spawn(async move {
        if let Err(err) = tokio::spawn(task).await {
            log::error!("{name} task died: {err}");
        }
    });
}
