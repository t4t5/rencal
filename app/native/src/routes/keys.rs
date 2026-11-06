use crate::keys::{self, KeyEdit, KeysSnapshot};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

// get: the user's bindings from keys.toml; `keys-changed` reports later edits.
// edit: change entries (Settings → Shortcuts) and return the new bindings.

#[derive(Clone)]
pub struct KeysApiImpl;

impl KeysApiImpl {
    pub async fn get(self) -> KeysSnapshot {
        keys::load()
    }

    pub async fn edit(self, edits: Vec<KeyEdit>) -> TauResult<KeysSnapshot> {
        keys::edit(&edits).map_err(|message| RpcError::new(RpcErrorKind::Configuration, message))
    }
}
