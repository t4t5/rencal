use crate::keys::{self, KeyEdit, KeysSnapshot};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

// get: the user's bindings from keys.toml; `keys-changed` reports later edits.
// edit: change entries (Settings → Shortcuts) and return the new bindings.
#[taurpc::procedures(path = "keys", export_to = "../src/rpc/bindings.ts")]
pub trait KeysApi {
    async fn get() -> KeysSnapshot;
    async fn edit(edits: Vec<KeyEdit>) -> TauResult<KeysSnapshot>;
}

#[derive(Clone)]
pub struct KeysApiImpl;

#[taurpc::resolvers]
impl KeysApi for KeysApiImpl {
    async fn get(self) -> KeysSnapshot {
        keys::load()
    }

    async fn edit(self, edits: Vec<KeyEdit>) -> TauResult<KeysSnapshot> {
        keys::edit(&edits).map_err(|message| RpcError::new(RpcErrorKind::Configuration, message))
    }
}
