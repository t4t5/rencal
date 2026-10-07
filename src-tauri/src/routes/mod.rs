pub mod caldir;
pub mod config;
pub mod omarchy;
pub mod platform;
pub mod plugins;
pub mod themes;

/// Route failures are `rencal_core`'s classified error, exported as `RpcError`.
pub type TauResult<T> = Result<T, rencal_core::error::CoreError>;

#[cfg(test)]
mod tests {
    use rencal_core::error::{CoreError, CoreErrorKind};
    use serde_json::json;

    #[test]
    fn tauri_rejects_with_the_error_object_without_an_envelope() {
        let error = CoreError::new(CoreErrorKind::EventNotFound, "Event not found: meeting");
        let response: tauri::ipc::InvokeResponse = Err::<(), _>(error).into();
        let tauri::ipc::InvokeResponse::Err(tauri::ipc::InvokeError(value)) = response else {
            panic!("expected a rejected invoke");
        };
        assert_eq!(
            value,
            json!({ "kind": "event_not_found", "message": "Event not found: meeting" })
        );
    }
}
