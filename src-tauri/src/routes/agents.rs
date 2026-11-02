use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::skill_install::{self, Skill, SkillsStatus};

#[taurpc::procedures(path = "agents", export_to = "../src/rpc/bindings.ts")]
pub trait AgentsApi {
    // Install and uninstall return the new status.
    async fn skills() -> TauResult<SkillsStatus>;
    async fn install_skill(skill: Skill) -> TauResult<SkillsStatus>;
    async fn uninstall_skill(skill: Skill) -> TauResult<SkillsStatus>;
}

#[derive(Clone)]
pub struct AgentsApiImpl;

#[taurpc::resolvers]
impl AgentsApi for AgentsApiImpl {
    async fn skills(self) -> TauResult<SkillsStatus> {
        skill_install::status().map_err(skill_error)
    }

    async fn install_skill(self, skill: Skill) -> TauResult<SkillsStatus> {
        let files = skill_install::files(skill)
            .await
            .map_err(|error| RpcError::new(RpcErrorKind::Network, error))?;
        skill_install::install(skill, &files).map_err(skill_error)?;
        skill_install::status().map_err(skill_error)
    }

    async fn uninstall_skill(self, skill: Skill) -> TauResult<SkillsStatus> {
        skill_install::uninstall(skill).map_err(skill_error)?;
        skill_install::status().map_err(skill_error)
    }
}

fn skill_error(message: String) -> RpcError {
    RpcError::new(RpcErrorKind::Io, message)
}
