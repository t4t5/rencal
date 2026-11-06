use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::skill_install::{self, Skill, SkillsStatus};


#[derive(Clone)]
pub struct AgentsApiImpl;

impl AgentsApiImpl {
    pub async fn skills(self) -> TauResult<SkillsStatus> {
        skill_install::status().map_err(skill_error)
    }

    pub async fn install_skill(self, skill: Skill) -> TauResult<SkillsStatus> {
        let files = skill_install::files(skill)
            .await
            .map_err(|error| RpcError::new(RpcErrorKind::Network, error))?;
        skill_install::install(skill, &files).map_err(skill_error)?;
        skill_install::status().map_err(skill_error)
    }

    pub async fn uninstall_skill(self, skill: Skill) -> TauResult<SkillsStatus> {
        skill_install::uninstall(skill).map_err(skill_error)?;
        skill_install::status().map_err(skill_error)
    }
}

fn skill_error(message: String) -> RpcError {
    RpcError::new(RpcErrorKind::Io, message)
}
