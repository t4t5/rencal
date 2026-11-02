use std::sync::Arc;

use crate::control::{CommandOutcome, CommandRequest};
use crate::state::AppState;

// `rencal do` requests. take_pending: drain the queue (`command-requested`
// signals new ones); respond: report a request's outcome.
#[taurpc::procedures(path = "commands", export_to = "../src/rpc/bindings.ts")]
pub trait CommandsApi {
    async fn take_pending() -> Vec<CommandRequest>;
    async fn respond(id: u32, outcome: CommandOutcome);
}

#[derive(Clone)]
pub struct CommandsApiImpl {
    state: Arc<AppState>,
}

impl CommandsApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

#[taurpc::resolvers]
impl CommandsApi for CommandsApiImpl {
    async fn take_pending(self) -> Vec<CommandRequest> {
        self.state.commands.take()
    }

    async fn respond(self, id: u32, outcome: CommandOutcome) {
        self.state.commands.resolve(id, outcome);
    }
}
