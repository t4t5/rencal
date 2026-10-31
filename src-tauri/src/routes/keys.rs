use crate::keys::{self, KeysSnapshot};

// get: the user's bindings from keys.toml; `keys-changed` reports later edits.
#[taurpc::procedures(path = "keys", export_to = "../src/rpc/bindings.ts")]
pub trait KeysApi {
    async fn get() -> KeysSnapshot;
}

#[derive(Clone)]
pub struct KeysApiImpl;

#[taurpc::resolvers]
impl KeysApi for KeysApiImpl {
    async fn get(self) -> KeysSnapshot {
        keys::load()
    }
}
