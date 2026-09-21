use std::collections::HashSet;
use std::future::Future;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::pin::Pin;

use anyhow::{Context, Result, anyhow, bail};
use rencal_plugin_contract::{
    MANIFEST_FILE, validate_manifest, validate_manifest_owner, validate_release_tag,
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
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
struct PluginIndexEntry {
    id: String,
    name: String,
    repo: String,
    description: String,
    version: String,
    tag: String,
    released_at: String,
    stars: u64,
    contributions: Vec<String>,
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

async fn fetch_text(
    client: &dyn GithubClient,
    url: Url,
    context: &str,
) -> Result<FetchResult<String>> {
    let response = client.get(url, MAX_RESPONSE_SIZE).await?;
    if response.status == StatusCode::NOT_FOUND {
        return Ok(FetchResult::Missing);
    }
    if !response.status.is_success() {
        bail!("{context} returned HTTP {}", response.status);
    }
    let value = String::from_utf8(response.body)
        .with_context(|| format!("{context} was not valid UTF-8"))?;
    Ok(FetchResult::Found(value))
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

async fn build_index(
    client: &dyn GithubClient,
    api_base: &Url,
    raw_base: &Url,
) -> Result<IndexResult> {
    let repositories = search_repositories(client, api_base).await?;
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let mut previews = Vec::new();
    let mut ids = HashSet::new();

    for repository in repositories {
        let repo = format!("{}/{}", repository.owner.login, repository.name);
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
                            continue;
                        }
                    };
                if !valid_commit_sha(&commit.sha) {
                    warnings.push(format!(
                        "Skipping {repo}: release returned an invalid commit SHA"
                    ));
                    continue;
                }
                PackageSource {
                    reference: commit.sha,
                    release_tag: Some(release.tag_name),
                    released_at: release.published_at,
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
                        continue;
                    }
                };
                let Some(commit) = commits.into_iter().next() else {
                    warnings.push(format!("Skipping {repo}: default branch has no commits"));
                    continue;
                };
                if !valid_commit_sha(&commit.sha) {
                    warnings.push(format!(
                        "Skipping {repo}: default branch returned an invalid commit SHA"
                    ));
                    continue;
                }
                PackageSource {
                    reference: commit.sha,
                    release_tag: None,
                    released_at: commit.commit.committer.date,
                }
            }
        };

        let manifest_url = raw_file_url(raw_base, &repository, &source.reference, MANIFEST_FILE)?;
        let manifest_text =
            match fetch_text(client, manifest_url, &format!("{MANIFEST_FILE} for {repo}")).await? {
                FetchResult::Found(manifest) => manifest,
                FetchResult::Missing => {
                    warnings.push(format!(
                        "Skipping {repo}: {MANIFEST_FILE} is missing at {}",
                        source.reference
                    ));
                    continue;
                }
            };

        let manifest = match validate_manifest(&manifest_text, None).and_then(|manifest| {
            validate_manifest_owner(&manifest, &repository.owner.login)?;
            if let Some(tag) = &source.release_tag {
                validate_release_tag(&manifest, tag)?;
            }
            Ok(manifest)
        }) {
            Ok(manifest) => manifest,
            Err(error) => {
                warnings.push(format!("Skipping {repo}: {error}"));
                continue;
            }
        };

        if !ids.insert(manifest.id.clone()) {
            warnings.push(format!(
                "Skipping {repo}: duplicate plugin id {:?}",
                manifest.id
            ));
            continue;
        }

        let preview_url = match preview::fetch(
            client,
            raw_file_url(
                raw_base,
                &repository,
                &repository.default_branch,
                "preview.png",
            )?,
        )
        .await
        {
            Ok(Some(preview)) => {
                let url = preview.url();
                previews.push(preview);
                Some(url)
            }
            Ok(None) => None,
            Err(error) => {
                warnings.push(format!(
                    "{repo} on {}: could not use preview.png: {error:#}",
                    repository.default_branch
                ));
                None
            }
        };

        entries.push(PluginIndexEntry {
            id: manifest.id,
            name: manifest.name,
            repo,
            description: manifest.description,
            version: manifest.version,
            tag: source.release_tag.unwrap_or(source.reference),
            released_at: source.released_at,
            stars: repository.stargazers_count,
            contributions: vec!["theme".into()],
            preview_url,
        });
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
    let mut result = build_index(client, api_base, raw_base).await?;
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

    fn commit() -> MockReply {
        json(serde_json::json!({
            "sha": "1111111111111111111111111111111111111111",
            "commit": { "committer": { "date": "2026-09-19T12:00:00Z" } }
        }))
    }

    fn manifest(owner: &str, version: &str) -> String {
        format!(
            r#"id = "{owner}.dusk"
name = "Dusk"
version = "{version}"
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

    fn bases() -> (Url, Url) {
        (
            Url::parse("https://api.example.test/").unwrap(),
            Url::parse("https://raw.example.test/").unwrap(),
        )
    }

    #[tokio::test]
    async fn indexes_valid_latest_release_with_matching_v_tag() {
        let client = MockClient::new(vec![
            json(serde_json::json!({
                "total_count": 1,
                "items": [repository("Alice", "rencal-dusk", 42)],
            })),
            release("v1.2.3"),
            commit(),
            text(&manifest("alice", "1.2.3")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].repo, "Alice/rencal-dusk");
        assert_eq!(index.entries[0].version, "1.2.3");
        assert_eq!(index.entries[0].stars, 42);
        assert_eq!(index.entries[0].contributions, ["theme"]);
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
        let manifest = manifest("alice", "1.2.3").replacen(
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

        let index = build_index(&client, &api, &raw).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].contributions, ["theme"]);
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
            text(&manifest("alice", "1.2.3")),
            MockReply::Response(StatusCode::NOT_FOUND, Vec::new()),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries[0].tag, commit);
        assert_eq!(index.entries[0].released_at, "2026-09-19T12:00:00Z");
        assert_eq!(index.entries[0].version, "1.2.3");
        let commit_request = client
            .requests()
            .into_iter()
            .find(|url| url.path() == "/repos/Alice/rencal-dusk/commits")
            .unwrap();
        assert_eq!(commit_request.query().unwrap(), "sha=main&per_page=1");
    }

    #[tokio::test]
    async fn skips_mismatched_unsupported_and_malformed_manifests() {
        let unsupported = format!("{}\n[app]\nmain = \"main.js\"\n", manifest("bob", "1.0.0"));
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
            text(&manifest("someone-else", "1.0.0")),
            release("1.0.0"),
            commit(),
            text(&unsupported),
            release("1.0.0"),
            commit(),
            text("not = [valid toml"),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw).await.unwrap();

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
        std::fs::write(&output, "[\n  {\"last\": \"good\"}\n]\n").unwrap();
        let before = std::fs::read(&output).unwrap();

        assert!(refresh_index(&client, &api, &raw, &output).await.is_err());
        assert_eq!(std::fs::read(output).unwrap(), before);
    }
}
