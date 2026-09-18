use super::helpers::{build_connect_options, map_fields, provider};
use super::types::{ProviderConnectInfo, ProviderConnectStepKind};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};
use crate::state::AppState;

pub(super) async fn handler(
    state: &AppState,
    provider_name: String,
) -> TauResult<ProviderConnectInfo> {
    use caldir_core::rpc::{ConnectResponse, ConnectStepKind, CredentialsData, SetupData};

    let provider = provider(state, &provider_name)?;

    let port: u16 = 8080;
    let redirect_uri = format!("http://localhost:{}/callback", port);

    let options = build_connect_options(true, &redirect_uri);

    let connect_response = provider.connect(options, serde_json::Map::new()).await?;

    match connect_response {
        ConnectResponse::NeedsInput { step, data } => {
            let step_kind = match step {
                ConnectStepKind::OAuthRedirect => ProviderConnectStepKind::OAuthRedirect,
                ConnectStepKind::HostedOAuth => ProviderConnectStepKind::HostedOAuth,
                ConnectStepKind::Credentials => ProviderConnectStepKind::Credentials,
                ConnectStepKind::NeedsSetup => ProviderConnectStepKind::NeedsSetup,
            };

            let (fields, instructions) = match step {
                ConnectStepKind::Credentials => {
                    let cred_data: CredentialsData = serde_json::from_value(data).map_err(|e| {
                        RpcError::new(
                            RpcErrorKind::ProviderFailure,
                            format!("Failed to parse credentials data: {e}"),
                        )
                    })?;
                    (map_fields(cred_data.fields), None)
                }
                ConnectStepKind::NeedsSetup => {
                    let setup_data: SetupData = serde_json::from_value(data).map_err(|e| {
                        RpcError::new(
                            RpcErrorKind::ProviderFailure,
                            format!("Failed to parse setup data: {e}"),
                        )
                    })?;
                    (map_fields(setup_data.fields), Some(setup_data.instructions))
                }
                _ => (Vec::new(), None),
            };

            Ok(ProviderConnectInfo {
                step: step_kind,
                fields,
                instructions,
            })
        }
        ConnectResponse::Done { .. } => Err(RpcError::new(
            RpcErrorKind::ProviderFailure,
            "Provider completed without requesting input",
        )),
    }
}
