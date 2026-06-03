use super::helpers::load_caldir;
use crate::routes::TauResult;

pub(super) async fn handler() -> TauResult<Vec<String>> {
    let caldir = load_caldir()?;

    let mut names: Vec<String> = caldir
        .providers()
        .slugs()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    names.sort();

    Ok(names)
}
