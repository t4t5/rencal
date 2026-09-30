use std::collections::HashSet;
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use anyhow::{Context, Result, anyhow, bail};
use rencal_plugin_contract::{
    ContributionKind, MANIFEST_FILE, MIN_PROVIDER_CALDIR_CORE, PluginManifest,
    provider_is_compatible, release_asset_sha256, validate_manifest, validate_manifest_owner,
};
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize, de::DeserializeOwned};

mod preview;

const TOPIC: &str = "rencal-plugin";
const PAGE_SIZE: usize = 100;
const MAX_RESPONSE_SIZE: usize = 8 * 1024 * 1024;

type ClientFuture<'a> = Pin<Box<dyn Future<Output = Result<HttpResponse>> + Send + 'a>>;

trait GithubClient: Send + Sync {
    fn get(&self, url: Url, limit: usize) -> ClientFuture<'_>;
}

struct ReqwestGithubClient {
    client: reqwest::Client,
}

struct HttpResponse {
    status: StatusCode,
    body: Vec<u8>,
}

impl GithubClient for ReqwestGithubClient {
    fn get(&self, url: Url, limit: usize) -> ClientFuture<'_> {
        Box::pin(async move {
            let mut response = self
                .client
                .get(url)
                .send()
                .await
                .context("GitHub request failed")?;
            let status = response.status();
            if response
                .content_length()
                .is_some_and(|size| size > limit as u64)
            {
                bail!("GitHub response exceeded {limit} bytes");
            }
            let mut body = Vec::new();
            while let Some(chunk) = response.chunk().await.context("GitHub response failed")? {
                append_chunk(&mut body, &chunk, limit)?;
            }
            Ok(HttpResponse { status, body })
        })
    }
}

fn append_chunk(body: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<()> {
    if chunk.len() > limit.saturating_sub(body.len()) {
        bail!("GitHub response exceeded {limit} bytes");
    }
    body.extend_from_slice(chunk);
    Ok(())
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    total_count: usize,
    #[serde(default)]
    incomplete_results: bool,
    items: Vec<SearchRepository>,
}

#[derive(Clone, Debug, Deserialize)]
struct SearchRepository {
    name: String,
    owner: RepositoryOwner,
    stargazers_count: u64,
    default_branch: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RepositoryOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    published_at: String,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    /// `sha256:<hex>`; missing on assets uploaded before GitHub added digests.
    digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubCommit {
    sha: String,
    commit: GithubCommitDetails,
}

#[derive(Debug, Deserialize)]
struct GithubCommitDetails {
    committer: GithubCommitter,
}

#[derive(Debug, Deserialize)]
struct GithubCommitter {
    date: String,
}

struct PackageSource {
    reference: String,
    release_tag: Option<String>,
    released_at: String,
    assets: Vec<GithubAsset>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
struct PluginIndexEntry {
    id: String,
    name: String,
    repo: String,
    description: String,
    /// The release tag, or the default-branch commit for unreleased themes.
    tag: String,
    released_at: String,
    stars: u64,
    contributions: Vec<ContributionKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview_url: Option<String>,
}

struct IndexResult {
    entries: Vec<PluginIndexEntry>,
    warnings: Vec<String>,
    previews: Vec<preview::Preview>,
}

enum FetchResult<T> {
    Found(T),
    Missing,
}

async fn fetch_json<T: DeserializeOwned>(
    client: &dyn GithubClient,
    url: Url,
    context: &str,
) -> Result<FetchResult<T>> {
    let response = client.get(url, MAX_RESPONSE_SIZE).await?;
    if response.status == StatusCode::NOT_FOUND {
        return Ok(FetchResult::Missing);
    }
    if !response.status.is_success() {
        bail!("{context} returned HTTP {}", response.status);
    }
    let value = serde_json::from_slice(&response.body)
        .with_context(|| format!("{context} returned invalid JSON"))?;
    Ok(FetchResult::Found(value))
}

async fn fetch_bytes(
    client: &dyn GithubClient,
    url: Url,
    context: &str,
) -> Result<FetchResult<Vec<u8>>> {
    let response = client.get(url, MAX_RESPONSE_SIZE).await?;
    if response.status == StatusCode::NOT_FOUND {
        return Ok(FetchResult::Missing);
    }
    if !response.status.is_success() {
        bail!("{context} returned HTTP {}", response.status);
    }
    Ok(FetchResult::Found(response.body))
}

fn api_url(base: &Url, segments: &[&str]) -> Result<Url> {
    let mut url = base.clone();
    url.path_segments_mut()
        .map_err(|_| anyhow!("GitHub API base URL cannot hold path segments"))?
        .clear()
        .extend(segments);
    Ok(url)
}

fn raw_file_url(
    base: &Url,
    repository: &SearchRepository,
    reference: &str,
    file: &str,
) -> Result<Url> {
    let mut url = base.clone();
    url.path_segments_mut()
        .map_err(|_| anyhow!("GitHub raw base URL cannot hold path segments"))?
        .clear()
        .push(&repository.owner.login)
        .push(&repository.name)
        .push(reference)
        .push(file);
    Ok(url)
}

fn valid_commit_sha(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

async fn search_repositories(
    client: &dyn GithubClient,
    api_base: &Url,
) -> Result<Vec<SearchRepository>> {
    let mut repositories = Vec::new();
    let mut page = 1;
    loop {
        let mut url = api_url(api_base, &["search", "repositories"])?;
        url.query_pairs_mut()
            .append_pair("q", &format!("topic:{TOPIC}"))
            .append_pair("sort", "stars")
            .append_pair("order", "desc")
            .append_pair("per_page", &PAGE_SIZE.to_string())
            .append_pair("page", &page.to_string());
        let response: SearchResponse = match fetch_json(client, url, "repository search").await? {
            FetchResult::Found(response) => response,
            FetchResult::Missing => bail!("repository search unexpectedly returned HTTP 404"),
        };
        // A timed-out search omits repositories, which would unlist them.
        if response.incomplete_results {
            bail!("repository search returned incomplete results");
        }
        let exhausted = response.items.is_empty()
            || repositories.len() + response.items.len() >= response.total_count
            || response.items.len() < PAGE_SIZE;
        repositories.extend(response.items);
        if exhausted {
            break;
        }
        page += 1;
    }
    Ok(repositories)
}

/// Indexes every tagged repository. `previous` is the deployed index: a listed
/// plugin that GitHub fails to serve keeps its entry until the next run, so
/// an outage can't unlist it.
async fn build_index(
    client: &dyn GithubClient,
    api_base: &Url,
    raw_base: &Url,
    previous: &[PluginIndexEntry],
) -> Result<IndexResult> {
    let repositories = search_repositories(client, api_base).await?;
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let mut previews = Vec::new();
    let mut ids = HashSet::new();

    for repository in repositories {
        let repo = format!("{}/{}", repository.owner.login, repository.name);
        let (entry, preview) = match index_repository(
            client,
            api_base,
            raw_base,
            &repository,
            &repo,
            &mut warnings,
        )
        .await
        {
            Ok(Some(indexed)) => indexed,
            Ok(None) => continue,
            Err(error) => {
                let Some(entry) = previous
                    .iter()
                    .find(|entry| entry.repo.eq_ignore_ascii_case(&repo))
                else {
                    warnings.push(format!("Skipping {repo}: {error:#}"));
                    continue;
                };
                warnings.push(format!("Keeping previous entry for {repo}: {error:#}"));
                (entry.clone(), None)
            }
        };

        if !ids.insert(entry.id.clone()) {
            warnings.push(format!(
                "Skipping {repo}: duplicate plugin id {:?}",
                entry.id
            ));
            continue;
        }
        previews.extend(preview);
        entries.push(entry);
    }

    if entries.is_empty() && !previous.is_empty() {
        bail!(
            "refusing to replace {} listed plugin(s) with an empty index",
            previous.len()
        );
    }

    entries.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(IndexResult {
        entries,
        warnings,
        previews,
    })
}

/// `Ok(None)` rejects the plugin itself, with a warning; `Err` means GitHub
/// couldn't be read.
async fn index_repository(
    client: &dyn GithubClient,
    api_base: &Url,
    raw_base: &Url,
    repository: &SearchRepository,
    repo: &str,
    warnings: &mut Vec<String>,
) -> Result<Option<(PluginIndexEntry, Option<preview::Preview>)>> {
    let release_url = api_url(
        api_base,
        &[
            "repos",
            &repository.owner.login,
            &repository.name,
            "releases",
            "latest",
        ],
    )?;
    let source = match fetch_json::<GithubRelease>(
        client,
        release_url,
        &format!("latest release for {repo}"),
    )
    .await?
    {
        FetchResult::Found(release) => {
            let url = api_url(
                api_base,
                &[
                    "repos",
                    &repository.owner.login,
                    &repository.name,
                    "commits",
                    &release.tag_name,
                ],
            )?;
            let commit: GithubCommit =
                match fetch_json(client, url, &format!("release commit for {repo}")).await? {
                    FetchResult::Found(commit) => commit,
                    FetchResult::Missing => {
                        warnings.push(format!("Skipping {repo}: release commit is missing"));
                        return Ok(None);
                    }
                };
            if !valid_commit_sha(&commit.sha) {
                warnings.push(format!(
                    "Skipping {repo}: release returned an invalid commit SHA"
                ));
                return Ok(None);
            }
            PackageSource {
                reference: commit.sha,
                release_tag: Some(release.tag_name),
                released_at: release.published_at,
                assets: release.assets,
            }
        }
        FetchResult::Missing => {
            let mut commit_url = api_url(
                api_base,
                &[
                    "repos",
                    &repository.owner.login,
                    &repository.name,
                    "commits",
                ],
            )?;
            commit_url
                .query_pairs_mut()
                .append_pair("sha", &repository.default_branch)
                .append_pair("per_page", "1");
            let commits: Vec<GithubCommit> = match fetch_json(
                client,
                commit_url,
                &format!("default branch head for {repo}"),
            )
            .await?
            {
                FetchResult::Found(commit) => commit,
                FetchResult::Missing => {
                    warnings.push(format!("Skipping {repo}: default branch head is missing"));
                    return Ok(None);
                }
            };
            let Some(commit) = commits.into_iter().next() else {
                warnings.push(format!("Skipping {repo}: default branch has no commits"));
                return Ok(None);
            };
            if !valid_commit_sha(&commit.sha) {
                warnings.push(format!(
                    "Skipping {repo}: default branch returned an invalid commit SHA"
                ));
                return Ok(None);
            }
            PackageSource {
                reference: commit.sha,
                release_tag: None,
                released_at: commit.commit.committer.date,
                assets: Vec::new(),
            }
        }
    };

    let manifest_url = raw_file_url(raw_base, repository, &source.reference, MANIFEST_FILE)?;
    let manifest_bytes =
        match fetch_bytes(client, manifest_url, &format!("{MANIFEST_FILE} for {repo}")).await? {
            FetchResult::Found(manifest) => manifest,
            FetchResult::Missing => {
                warnings.push(format!(
                    "Skipping {repo}: {MANIFEST_FILE} is missing at {}",
                    source.reference
                ));
                return Ok(None);
            }
        };
    let Ok(manifest_text) = String::from_utf8(manifest_bytes) else {
        warnings.push(format!(
            "Skipping {repo}: {MANIFEST_FILE} is not valid UTF-8"
        ));
        return Ok(None);
    };

    let manifest = match validate_manifest(&manifest_text, None).and_then(|manifest| {
        validate_manifest_owner(&manifest, &repository.owner.login)?;
        Ok(manifest)
    }) {
        Ok(manifest) => manifest,
        Err(error) => {
            warnings.push(format!("Skipping {repo}: {error}"));
            return Ok(None);
        }
    };

    let contributions = match installable_contributions(&manifest, &source, repo, warnings) {
        Ok(contributions) => contributions,
        Err(error) => {
            warnings.push(format!("Skipping {repo}: {error}"));
            return Ok(None);
        }
    };

    let preview = match preview::fetch(
        client,
        raw_file_url(
            raw_base,
            repository,
            &repository.default_branch,
            "preview.png",
        )?,
    )
    .await
    {
        Ok(preview) => preview,
        Err(error) => {
            warnings.push(format!(
                "{repo} on {}: could not use preview.png: {error:#}",
                repository.default_branch
            ));
            None
        }
    };

    Ok(Some((
        PluginIndexEntry {
            id: manifest.id,
            name: manifest.name,
            repo: repo.to_string(),
            description: manifest.description,
            tag: source.release_tag.unwrap_or(source.reference),
            released_at: source.released_at,
            stars: repository.stargazers_count,
            contributions,
            preview_url: preview.as_ref().map(preview::Preview::url),
        },
        preview,
    )))
}

/// What renCal can install from this source. Providers run a downloaded
/// binary, so each needs a caldir-core renCal speaks and a release asset with
/// a digest to verify it against.
fn installable_contributions(
    manifest: &PluginManifest,
    source: &PackageSource,
    repo: &str,
    warnings: &mut Vec<String>,
) -> Result<Vec<ContributionKind>> {
    let mut contributions = Vec::new();
    if !manifest.contributes.themes.is_empty() {
        contributions.push(ContributionKind::Theme);
    }
    let providers = &manifest.contributes.providers;
    if providers.is_empty() {
        return Ok(contributions);
    }
    if source.release_tag.is_none() {
        bail!("provider plugins must be published as a GitHub release");
    }

    let mut installable = false;
    for provider in providers {
        if !provider_is_compatible(provider) {
            warnings.push(format!(
                "{repo}: provider {:?} was built with caldir-core {}, below {MIN_PROVIDER_CALDIR_CORE}",
                provider.slug, provider.caldir_core
            ));
        } else if !source.assets.iter().any(|asset| {
            provider.asset_target(&asset.name).is_some()
                && asset
                    .digest
                    .as_deref()
                    .and_then(release_asset_sha256)
                    .is_some()
        }) {
            warnings.push(format!(
                "{repo}: provider {:?} has no {} release asset with a sha256 digest",
                provider.slug, provider.asset
            ));
        } else {
            installable = true;
        }
    }
    if installable {
        contributions.push(ContributionKind::Provider);
    }
    if contributions.is_empty() {
        bail!("no installable contributions");
    }
    Ok(contributions)
}

/// A missing file is an empty index, as on a first local run.
fn read_index(path: &Path) -> Result<Vec<PluginIndexEntry>> {
    match std::fs::read(path) {
        Ok(data) => serde_json::from_slice(&data)
            .with_context(|| format!("{} is not a valid plugin index", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error).with_context(|| format!("could not read {}", path.display())),
    }
}

fn write_index(path: &Path, entries: &[PluginIndexEntry]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)
        .with_context(|| format!("could not create {}", parent.display()))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .with_context(|| format!("could not create temporary index in {}", parent.display()))?;
    serde_json::to_writer_pretty(&mut temporary, entries).context("could not serialize index")?;
    temporary
        .write_all(b"\n")
        .context("could not finish index")?;
    temporary
        .as_file()
        .sync_all()
        .context("could not sync index")?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| format!("could not replace {}", path.display()))?;
    Ok(())
}

async fn refresh_index(
    client: &dyn GithubClient,
    api_base: &Url,
    raw_base: &Url,
    output: &Path,
) -> Result<IndexResult> {
    let previous = read_index(output)?;
    let mut result = build_index(client, api_base, raw_base, &previous).await?;
    let directory = output
        .parent()
        .unwrap_or(Path::new("."))
        .join("plugin-previews");
    for preview in &result.previews {
        if let Err(error) = preview.write(&directory) {
            result
                .warnings
                .push(format!("Could not publish {}: {error:#}", preview.url()));
            for entry in &mut result.entries {
                if entry.preview_url.as_deref() == Some(&preview.url()) {
                    entry.preview_url = None;
                }
            }
        }
    }
    write_index(output, &result.entries)?;
    Ok(result)
}

fn output_path() -> Result<PathBuf> {
    let mut args = std::env::args_os().skip(1);
    let output = args
        .next()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("website/public/plugins.json"));
    if args.next().is_some() {
        bail!("usage: rencal-plugin-indexer [output-path]");
    }
    Ok(output)
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        "application/vnd.github+json".parse().expect("valid header"),
    );
    headers.insert(
        "X-GitHub-Api-Version",
        "2022-11-28".parse().expect("valid header"),
    );
    if let Ok(token) = std::env::var("GITHUB_TOKEN")
        && !token.is_empty()
    {
        headers.insert(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {token}")
                .parse()
                .context("invalid GitHub token")?,
        );
    }
    let client = ReqwestGithubClient {
        client: reqwest::Client::builder()
            .user_agent("renCal plugin indexer")
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("could not create GitHub client")?,
    };
    let result = refresh_index(
        &client,
        &Url::parse("https://api.github.com/").expect("valid GitHub API URL"),
        &Url::parse("https://raw.githubusercontent.com/").expect("valid GitHub raw URL"),
        &output_path()?,
    )
    .await?;
    for warning in &result.warnings {
        eprintln!("warning: {warning}");
    }
    println!("Indexed {} plugin(s)", result.entries.len());
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use super::*;

    enum MockReply {
        Response(StatusCode, Vec<u8>),
        Error(String),
    }

    struct MockClient {
        replies: Mutex<VecDeque<MockReply>>,
        requests: Mutex<Vec<Url>>,
    }

    impl MockClient {
        fn new(replies: Vec<MockReply>) -> Self {
            Self {
                replies: Mutex::new(replies.into()),
                requests: Mutex::new(Vec::new()),
            }
        }

        fn requests(&self) -> Vec<Url> {
            self.requests.lock().unwrap().clone()
        }
    }

    impl GithubClient for MockClient {
        fn get(&self, url: Url, _limit: usize) -> ClientFuture<'_> {
            self.requests.lock().unwrap().push(url);
            let reply = self.replies.lock().unwrap().pop_front().unwrap();
            Box::pin(async move {
                match reply {
                    MockReply::Response(status, body) => Ok(HttpResponse { status, body }),
                    MockReply::Error(message) => Err(anyhow!(message)),
                }
            })
        }
    }

    fn json(value: serde_json::Value) -> MockReply {
        MockReply::Response(StatusCode::OK, serde_json::to_vec(&value).unwrap())
    }

    fn text(value: &str) -> MockReply {
        MockReply::Response(StatusCode::OK, value.as_bytes().to_vec())
    }

    fn repository(owner: &str, name: &str, stars: u64) -> serde_json::Value {
        serde_json::json!({
            "name": name,
            "owner": { "login": owner },
            "stargazers_count": stars,
            "default_branch": "main",
        })
    }

    fn release(tag: &str) -> MockReply {
        json(serde_json::json!({
            "tag_name": tag,
            "published_at": "2026-09-18T12:00:00Z",
        }))
    }

    fn release_with_assets(tag: &str, assets: serde_json::Value) -> MockReply {
        json(serde_json::json!({
            "tag_name": tag,
            "published_at": "2026-09-18T12:00:00Z",
            "assets": assets,
        }))
    }

    fn provider_asset(digest: Option<&str>) -> serde_json::Value {
        serde_json::json!({
            "name": "caldir-provider-tuta-x86_64-unknown-linux-gnu.tar.gz",
            "digest": digest,
        })
    }

    fn commit() -> MockReply {
        json(serde_json::json!({
            "sha": "1111111111111111111111111111111111111111",
            "commit": { "committer": { "date": "2026-09-19T12:00:00Z" } }
        }))
    }

    fn manifest(owner: &str) -> String {
        format!(
            r#"id = "{owner}.dusk"
name = "Dusk"
description = "A quiet dark theme"
min_rencal_version = "0.8.0"

[[contributes.themes]]
id = "dark"
name = "Dusk Dark"
css = "theme.css"
appearance = "dark"
"#
        )
    }

    const PROVIDER: &str = r#"
[[contributes.providers]]
slug = "tuta"
name = "Tuta"
asset = "caldir-provider-tuta-{target}.tar.gz"
caldir_core = "0.16.0"
"#;

    fn provider_manifest(owner: &str, caldir_core: &str) -> String {
        format!(
            r#"id = "{owner}.tuta"
name = "Tuta"
description = "Sync your Tuta calendars"
min_rencal_version = "0.8.0"
{}"#,
            PROVIDER.replace("0.16.0", caldir_core)
        )
    }

    fn bases() -> (Url, Url) {
        (
            Url::parse("https://api.example.test/").unwrap(),
            Url::parse("https://raw.example.test/").unwrap(),
        )
    }

    #[tokio::test]
    async fn indexes_the_latest_release_by_tag() {
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "rencal-dusk", 42)],
            })),
            release("v1.2.3"),
            commit(),
            text(&manifest("alice")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].repo, "Alice/rencal-dusk");
        assert_eq!(index.entries[0].tag, "v1.2.3");
        assert_eq!(index.entries[0].stars, 42);
        assert_eq!(index.entries[0].contributions, [ContributionKind::Theme]);
        assert!(index.entries[0].preview_url.is_none());
        assert!(
            !serde_json::to_value(&index.entries[0])
                .unwrap()
                .as_object()
                .unwrap()
                .contains_key("preview_url")
        );
        let requests = client.requests();
        assert!(requests.iter().any(|url| {
            url.path()
                == "/Alice/rencal-dusk/1111111111111111111111111111111111111111/rencal-plugin.toml"
        }));
        assert!(
            requests
                .iter()
                .any(|url| url.path() == "/Alice/rencal-dusk/main/preview.png")
        );
    }

    #[tokio::test]
    async fn indexes_a_theme_plugin_with_font_contributions() {
        let manifest = manifest("alice").replacen(
            "[[contributes.themes]]",
            "[[contributes.fonts]]\nfamily = \"Pixel\"\nfile = \"fonts/pixel.woff2\"\n\n[[contributes.themes]]",
            1,
        );
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "rencal-dusk", 42)],
            })),
            release("v1.2.3"),
            commit(),
            text(&manifest),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].contributions, [ContributionKind::Theme]);
    }

    #[tokio::test]
    async fn indexes_default_branch_head_without_a_release() {
        let commit = "1111111111111111111111111111111111111111";
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "rencal-dusk", 42)],
            })),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
            json(serde_json::json!([{
                "sha": commit,
                "commit": { "committer": { "date": "2026-09-19T12:00:00Z" } },
            }])),
            text(&manifest("alice")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries[0].tag, commit);
        assert_eq!(index.entries[0].released_at, "2026-09-19T12:00:00Z");
        assert_eq!(
            index.entries[0].tag,
            "1111111111111111111111111111111111111111"
        );
        let commit_request = client
            .requests()
            .into_iter()
            .find(|url| url.path() == "/repos/Alice/rencal-dusk/commits")
            .unwrap();
        assert_eq!(commit_request.query().unwrap(), "sha=main&per_page=1");
    }

    #[tokio::test]
    async fn indexes_a_provider_release_with_a_verifiable_asset() {
        let digest = format!("sha256:{}", "a".repeat(64));
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "caldir-provider-tuta", 7)],
            })),
            release_with_assets(
                "v1.0.0",
                serde_json::json!([
                    provider_asset(Some(&digest)),
                    { "name": "README.md", "digest": null },
                ]),
            ),
            commit(),
            text(&provider_manifest("alice", "0.16.0")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.warnings.is_empty(), "{:?}", index.warnings);
        assert_eq!(index.entries[0].contributions, [ContributionKind::Provider]);
        assert_eq!(
            serde_json::to_value(&index.entries[0]).unwrap()["contributions"],
            serde_json::json!(["provider"])
        );
    }

    #[tokio::test]
    async fn skips_provider_plugins_without_a_release() {
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "caldir-provider-tuta", 7)],
            })),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
            json(serde_json::json!([{
                "sha": "1111111111111111111111111111111111111111",
                "commit": { "committer": { "date": "2026-09-19T12:00:00Z" } },
            }])),
            text(&provider_manifest("alice", "0.16.0")),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.entries.is_empty());
        assert_eq!(index.warnings.len(), 1);
        assert!(
            index.warnings[0].contains("must be published as a GitHub release"),
            "{:?}",
            index.warnings
        );
    }

    #[tokio::test]
    async fn drops_providers_rencal_cannot_install() {
        let digest = format!("sha256:{}", "a".repeat(64));
        let mixed = format!("{}{PROVIDER}", manifest("carol")).replace("0.16.0", "0.11.2");
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 3,
                "items": [
                    repository("Alice", "no-digest", 3),
                    repository("Bob", "old-caldir", 2),
                    repository("Carol", "mixed", 1),
                ],
            })),
            release_with_assets("v1.0.0", serde_json::json!([provider_asset(None)])),
            commit(),
            text(&provider_manifest("alice", "0.16.0")),
            release_with_assets("v1.0.0", serde_json::json!([provider_asset(Some(&digest))])),
            commit(),
            text(&provider_manifest("bob", "0.11.2")),
            release_with_assets("v1.0.0", serde_json::json!([provider_asset(Some(&digest))])),
            commit(),
            text(&mixed),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].repo, "Carol/mixed");
        assert_eq!(index.entries[0].contributions, [ContributionKind::Theme]);
        let warnings = index.warnings.join("\n");
        assert!(
            warnings.contains("Alice/no-digest: provider \"tuta\" has no caldir-provider-tuta-{target}.tar.gz release asset with a sha256 digest"),
            "{warnings}"
        );
        assert!(warnings.contains("Skipping Alice/no-digest: no installable contributions"));
        assert!(
            warnings
                .contains("Bob/old-caldir: provider \"tuta\" was built with caldir-core 0.11.2")
        );
        assert!(warnings.contains("Skipping Bob/old-caldir: no installable contributions"));
        assert!(
            warnings.contains("Carol/mixed: provider \"tuta\" was built with caldir-core 0.11.2")
        );
        assert!(!warnings.contains("Skipping Carol/mixed"));
    }

    #[tokio::test]
    async fn skips_mismatched_unsupported_and_malformed_manifests() {
        let unsupported = format!("{}\n[app]\nmain = \"main.js\"\n", manifest("bob"));
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 3,
                "items": [
                    repository("Alice", "wrong-owner", 3),
                    repository("Bob", "unsupported", 2),
                    repository("Carol", "malformed", 1),
                ],
            })),
            release("1.0.0"),
            commit(),
            text(&manifest("someone-else")),
            release("1.0.0"),
            commit(),
            text(&unsupported),
            release("1.0.0"),
            commit(),
            text("not = [valid toml"),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[]).await.unwrap();

        assert!(index.entries.is_empty());
        assert_eq!(index.warnings.len(), 3);
        assert!(index.warnings[0].contains("does not match repository owner"));
        assert!(index.warnings[1].contains("unsupported package contribution"));
        assert!(index.warnings[2].contains("invalid rencal-plugin.toml"));
    }

    #[tokio::test]
    async fn network_failure_leaves_last_good_output_untouched() {
        let client = MockClient::new(vec![MockReply::Error("offline".into())]);
        let (api, raw) = bases();
        let temp = tempfile::tempdir().unwrap();
        let output = temp.path().join("plugins.json");
        write_index(&output, &[listed("Alice/rencal-dusk")]).unwrap();
        let before = std::fs::read(&output).unwrap();

        assert!(refresh_index(&client, &api, &raw, &output).await.is_err());
        assert_eq!(std::fs::read(output).unwrap(), before);
    }

    fn listed(repo: &str) -> PluginIndexEntry {
        let owner = repo.split('/').next().unwrap().to_lowercase();
        PluginIndexEntry {
            id: format!("{owner}.dusk"),
            name: "Dusk".into(),
            repo: repo.into(),
            description: "A quiet dark theme".into(),
            tag: "v1.0.0".into(),
            released_at: "2026-09-01T12:00:00Z".into(),
            stars: 1,
            contributions: vec![ContributionKind::Theme],
            preview_url: Some(format!(
                "https://rencal.org/plugin-previews/{}.png",
                "b".repeat(64)
            )),
        }
    }

    #[tokio::test]
    async fn failing_repositories_keep_their_listing_or_stay_unlisted() {
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 3,
                "items": [
                    repository("Alice", "rencal-dusk", 3),
                    repository("Bob", "rencal-new", 2),
                    repository("Carol", "rencal-dawn", 1),
                ],
            })),
            MockReply::Response(StatusCode::INTERNAL_SERVER_ERROR, Vec::new()),
            MockReply::Error("connection reset".into()),
            release("v2.0.0"),
            commit(),
            text(&manifest("carol")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();
        let previous = [listed("Alice/rencal-dusk")];

        let index = build_index(&client, &api, &raw, &previous).await.unwrap();

        assert_eq!(index.entries.len(), 2);
        assert_eq!(index.entries[0], previous[0]);
        assert_eq!(index.entries[1].repo, "Carol/rencal-dawn");
        assert_eq!(index.entries[1].tag, "v2.0.0");
        let warnings = index.warnings.join("\n");
        assert!(
            warnings.contains("Keeping previous entry for Alice/rencal-dusk"),
            "{warnings}"
        );
        assert!(
            warnings.contains("Skipping Bob/rencal-new: connection reset"),
            "{warnings}"
        );
    }

    #[tokio::test]
    async fn a_listed_plugin_that_breaks_its_manifest_is_unlisted() {
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 2,
                "items": [
                    repository("Alice", "rencal-dusk", 2),
                    repository("Carol", "rencal-dawn", 1),
                ],
            })),
            release("v2.0.0"),
            commit(),
            MockReply::Response(StatusCode::OK, vec![0xff, 0xfe]),
            release("v2.0.0"),
            commit(),
            text(&manifest("carol")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw, &[listed("Alice/rencal-dusk")])
            .await
            .unwrap();

        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].repo, "Carol/rencal-dawn");
        assert!(index.warnings[0].contains("is not valid UTF-8"));
    }

    #[tokio::test]
    async fn incomplete_search_results_fail_the_run() {
        let client = MockClient::new(vec![json(serde_json::json!({
            "total_count": 1,
            "incomplete_results": true,
            "items": [],
        }))]);
        let (api, raw) = bases();

        let error = build_index(&client, &api, &raw, &[]).await.err().unwrap();

        assert!(
            error.to_string().contains("incomplete results"),
            "{error:#}"
        );
    }

    #[tokio::test]
    async fn an_empty_index_never_replaces_a_listed_catalog() {
        let client = MockClient::new(vec![json(serde_json::json!({
            "total_count": 0,
            "items": [],
        }))]);
        let (api, raw) = bases();
        let temp = tempfile::tempdir().unwrap();
        let output = temp.path().join("plugins.json");
        write_index(&output, &[listed("Alice/rencal-dusk")]).unwrap();
        let before = std::fs::read(&output).unwrap();

        let error = refresh_index(&client, &api, &raw, &output)
            .await
            .err()
            .unwrap();

        assert!(error.to_string().contains("empty index"), "{error:#}");
        assert_eq!(std::fs::read(output).unwrap(), before);
    }
}
