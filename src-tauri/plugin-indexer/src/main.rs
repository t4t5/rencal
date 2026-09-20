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

const TOPIC: &str = "rencal-plugin";
const PAGE_SIZE: usize = 100;
const MAX_RESPONSE_SIZE: usize = 8 * 1024 * 1024;

type ClientFuture<'a> = Pin<Box<dyn Future<Output = Result<HttpResponse>> + Send + 'a>>;

trait GithubClient: Send + Sync {
    fn get(&self, url: Url) -> ClientFuture<'_>;
}

struct ReqwestGithubClient {
    client: reqwest::Client,
}

struct HttpResponse {
    status: StatusCode,
    body: Vec<u8>,
}

impl GithubClient for ReqwestGithubClient {
    fn get(&self, url: Url) -> ClientFuture<'_> {
        Box::pin(async move {
            let response = self
                .client
                .get(url)
                .send()
                .await
                .context("GitHub request failed")?;
            let status = response.status();
            let body = response.bytes().await.context("GitHub response failed")?;
            if body.len() > MAX_RESPONSE_SIZE {
                bail!("GitHub response exceeded {MAX_RESPONSE_SIZE} bytes");
            }
            Ok(HttpResponse {
                status,
                body: body.to_vec(),
            })
        })
    }
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
}

struct IndexResult {
    entries: Vec<PluginIndexEntry>,
    warnings: Vec<String>,
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
    let response = client.get(url).await?;
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
    let response = client.get(url).await?;
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

fn raw_manifest_url(base: &Url, repository: &SearchRepository, reference: &str) -> Result<Url> {
    let mut url = base.clone();
    url.path_segments_mut()
        .map_err(|_| anyhow!("GitHub raw base URL cannot hold path segments"))?
        .clear()
        .push(&repository.owner.login)
        .push(&repository.name)
        .push(reference)
        .push(MANIFEST_FILE);
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
            FetchResult::Found(release) => PackageSource {
                reference: release.tag_name.clone(),
                release_tag: Some(release.tag_name),
                released_at: release.published_at,
            },
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

        let manifest_url = raw_manifest_url(raw_base, &repository, &source.reference)?;
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

        entries.push(PluginIndexEntry {
            id: manifest.id,
            name: manifest.name,
            repo,
            description: manifest.description,
            version: manifest.version,
            tag: source.reference,
            released_at: source.released_at,
            stars: repository.stargazers_count,
            contributions: vec!["theme".into()],
        });
    }

    entries.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(IndexResult { entries, warnings })
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
    let result = build_index(client, api_base, raw_base).await?;
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
        fn get(&self, url: Url) -> ClientFuture<'_> {
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
            text(&manifest("alice", "1.2.3")),
        ]);
        let (api, raw) = bases();

        let index = build_index(&client, &api, &raw).await.unwrap();

        assert!(index.warnings.is_empty());
        assert_eq!(index.entries.len(), 1);
        assert_eq!(index.entries[0].repo, "Alice/rencal-dusk");
        assert_eq!(index.entries[0].version, "1.2.3");
        assert_eq!(index.entries[0].stars, 42);
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
            text(&manifest("someone-else", "1.0.0")),
            release("1.0.0"),
            text(&unsupported),
            release("1.0.0"),
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
