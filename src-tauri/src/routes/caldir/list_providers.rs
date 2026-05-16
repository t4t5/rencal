use crate::routes::TauResult;
use caldir_core::Caldir;

pub(super) async fn handler() -> TauResult<Vec<String>> {
    let caldir = Caldir::load().map_err(|e| e.to_string())?;

    let mut names: Vec<String> = caldir
        .providers()
        .slugs()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    names.sort();

    Ok(names)
}
