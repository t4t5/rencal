use super::helpers::load_caldir;
use super::helpers::map_fields;
use super::types::{ProviderConnectInfo, ProviderConnectStepKind};
use crate::routes::TauResult;
use caldir_core::ProviderSlug;

pub(super) async fn handler(provider_name: String) -> TauResult<ProviderConnectInfo> {
    use caldir_core::rpc::{ConnectResponse, ConnectStepKind, CredentialsData, SetupData};

    let caldir = load_caldir()?;
    let provider = caldir
        .provider(&ProviderSlug::from(provider_name.as_str()))
        .map_err(|e| e.to_string())?;

    let port: u16 = 8080;
    let redirect_uri = format!("http://localhost:{}/callback", port);

    let mut options = serde_json::Map::new();
    options.insert(
        "redirect_uri".into(),
        serde_json::Value::String(redirect_uri),
    );
    options.insert("hosted".into(), serde_json::Value::Bool(true));

    let connect_response = provider
        .connect(options, serde_json::Map::new())
        .await
        .map_err(|e| format!("Connect info failed: {}", e))?;

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
                    let cred_data: CredentialsData = serde_json::from_value(data)
                        .map_err(|e| format!("Failed to parse credentials data: {}", e))?;
                    (map_fields(cred_data.fields), None)
                }
                ConnectStepKind::NeedsSetup => {
                    let setup_data: SetupData = serde_json::from_value(data)
                        .map_err(|e| format!("Failed to parse setup data: {}", e))?;
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
        ConnectResponse::Done { .. } => {
            Err("Provider completed without requesting input".to_string())
        }
    }
}
