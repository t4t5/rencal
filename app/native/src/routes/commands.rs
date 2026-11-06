use std::sync::Arc;

use crate::control::{CommandOutcome, CommandRequest};
use crate::state::AppState;

// `rencal do` requests. take_pending: drain the queue (`command-requested`
// signals new ones); respond: report a request's outcome.

#[derive(Clone)]
pub struct CommandsApiImpl {
    state: Arc<AppState>,
}

impl CommandsApiImpl {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }
}

impl CommandsApiImpl {
    pub async fn take_pending(self) -> Vec<CommandRequest> {
        self.state.commands.take()
    }

    pub async fn respond(self, id: u32, outcome: CommandOutcome) {
        self.state.commands.resolve(id, outcome);
    }
}
