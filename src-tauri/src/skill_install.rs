//! Agent skills renCal installs for coding agents: its own, for building
//! plugins, and caldir's, for reading and editing events. Each lives in
//! renCal's data directory and is linked into every agent's skills folder,
//! only when the user asks.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(unix)]
use std::io::ErrorKind;

// Built into the binary, so an installed skill describes the running version.
const FILES: [(&str, &str); 4] = [
    ("SKILL.md", include_str!("../../skills/rencal/SKILL.md")),
    (
        "references/views.md",
        include_str!("../../skills/rencal/references/views.md"),
    ),
    (
        "references/themes.md",
        include_str!("../../skills/rencal/references/themes.md"),
    ),
    (
        "references/providers.md",
        include_str!("../../skills/rencal/references/providers.md"),
    ),
];
const CALDIR_SKILL_URL: &str = "https://caldir.org/skill.md";
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const MARKER: &str = ".rencal-managed";
#[cfg(unix)]
const AGENTS: [(&str, &str); 5] = [
    ("~/.agents", ".agents"),
    ("Codex", ".codex"),
    ("Claude Code", ".claude"),
    ("Pi", ".pi/agent"),
    ("Hermes", ".hermes"),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub enum Skill {
    /// Building renCal plugins. Built into this binary.
    #[serde(rename = "rencal")]
    Rencal,
    /// Reading and editing events with the caldir CLI. Fetched from caldir.org.
    #[serde(rename = "caldir")]
    Caldir,
}

impl Skill {
    const ALL: [Skill; 2] = [Skill::Rencal, Skill::Caldir];

    fn name(self) -> &'static str {
        match self {
            Skill::Rencal => "rencal",
            Skill::Caldir => "caldir",
        }
    }
}

type SkillFiles = Vec<(&'static str, String)>;

pub struct InstallReport {
    pub source: PathBuf,
    pub linked: Vec<PathBuf>,
    pub already_linked: Vec<PathBuf>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct SkillsStatus {
    /// False where renCal can't link skills (Windows).
    pub supported: bool,
    pub skills: Vec<SkillStatus>,
}

/// The coding agents in the home directory and whether each has the skill.
#[derive(Clone, Debug, Serialize, Type)]
pub struct SkillStatus {
    pub skill: Skill,
    /// False while a program the skill drives is missing (the caldir CLI).
    pub available: bool,
    pub agents: Vec<SkillAgent>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct SkillAgent {
    pub name: String,
    pub link: SkillLink,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub enum SkillLink {
    /// Links to renCal's copy of the skill.
    #[serde(rename = "linked")]
    Linked,
    /// Has no link to it; installing adds one, replacing any skill of that name.
    #[serde(rename = "missing")]
    Missing,
}

pub fn status() -> Result<SkillsStatus, String> {
    let (home, data) = dirs()?;
    let caldir_cli = caldir_cli_installed();
    Ok(SkillsStatus {
        supported: cfg!(unix),
        skills: Skill::ALL
            .into_iter()
            .map(|skill| SkillStatus {
                skill,
                available: skill != Skill::Caldir || caldir_cli,
                agents: agents_at(&home, &data, skill),
            })
            .collect(),
    })
}

/// The skill's current files: renCal's from this build, caldir's from caldir.org.
pub async fn files(skill: Skill) -> Result<SkillFiles, String> {
    match skill {
        Skill::Rencal => Ok(rencal_files()),
        Skill::Caldir => Ok(vec![("SKILL.md", fetch_caldir_skill().await?)]),
    }
}

pub fn install(skill: Skill, files: &[(&str, String)]) -> Result<InstallReport, String> {
    let (home, data) = dirs()?;
    install_at(&home, &data, skill, files)
}

/// Removes renCal's copy of the skill and the agent links to it, returning the links removed.
pub fn uninstall(skill: Skill) -> Result<Vec<PathBuf>, String> {
    let (home, data) = dirs()?;
    uninstall_at(&home, &data, skill)
}

/// Rewrites the installed skills, so they follow renCal and caldir updates.
/// Skills nobody installed are left alone, and caldir's isn't fetched.
pub async fn refresh() {
    let data = match dirs() {
        Ok((_, data)) => data,
        Err(error) => return log::warn!("Could not refresh agent skills: {error}"),
    };
    for skill in Skill::ALL {
        let source = skill_dir(&data, skill);
        if !source.join(MARKER).is_file() {
            continue;
        }
        let result = match files(skill).await {
            Ok(files) => write_files(&source, &files),
            Err(error) => Err(error),
        };
        if let Err(error) = result {
            log::warn!(
                "Could not refresh the {} agent skill: {error}",
                skill.name()
            );
        }
    }
}

/// renCal's skill as one document, for `rencal skill show`.
pub fn show() -> String {
    FILES
        .iter()
        .map(|(name, contents)| format!("==> {name} <==\n{contents}"))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn rencal_files() -> SkillFiles {
    FILES
        .iter()
        .map(|(name, contents)| (*name, (*contents).to_owned()))
        .collect()
}

fn dirs() -> Result<(PathBuf, PathBuf), String> {
    let home = dirs::home_dir().ok_or("Could not find your home directory")?;
    let data = dirs::data_local_dir().ok_or("Could not find your local data directory")?;
    Ok((home, data))
}

fn skill_dir(data: &Path, skill: Skill) -> PathBuf {
    data.join("rencal/agent-skills").join(skill.name())
}

fn agent_target(root: &Path, skill: Skill) -> PathBuf {
    root.join("skills").join(skill.name())
}

async fn fetch_caldir_skill() -> Result<String, String> {
    // reqwest leaves the TLS provider to the application; installing it is idempotent.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let fail = |error: reqwest::Error| format!("Could not download {CALDIR_SKILL_URL}: {error}");
    let text = reqwest::Client::builder()
        .user_agent(format!("renCal/{}", env!("CARGO_PKG_VERSION")))
        .timeout(FETCH_TIMEOUT)
        .build()
        .map_err(fail)?
        .get(CALDIR_SKILL_URL)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(fail)?
        .text()
        .await
        .map_err(fail)?;
    if !is_caldir_skill(&text) {
        return Err(format!("{CALDIR_SKILL_URL} is not the caldir skill"));
    }
    Ok(text)
}

// Never install an error page or a different skill under caldir's name.
fn is_caldir_skill(text: &str) -> bool {
    text.strip_prefix("---\n")
        .and_then(|rest| rest.split_once("\n---"))
        .is_some_and(|(frontmatter, _)| {
            frontmatter
                .lines()
                .any(|line| line.trim() == "name: caldir")
        })
}

fn caldir_cli_installed() -> bool {
    std::env::var_os("PATH").is_some_and(|path| {
        std::env::split_paths(&path).any(|dir| is_executable(&dir.join("caldir")))
    })
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    fs::metadata(path)
        .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.with_extension("exe").is_file()
}

fn write_files(source: &Path, files: &[(&str, String)]) -> Result<(), String> {
    for (name, contents) in files {
        let path = source.join(name);
        if fs::read_to_string(&path).is_ok_and(|current| &current == contents) {
            continue;
        }
        let parent = path.parent().expect("skill file has a parent");
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        fs::write(&path, contents)
            .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    }
    Ok(())
}

#[cfg(unix)]
fn install_at(
    home: &Path,
    data: &Path,
    skill: Skill,
    files: &[(&str, String)],
) -> Result<InstallReport, String> {
    use std::os::unix::fs::symlink;

    let source = skill_dir(data, skill);
    let mut report = InstallReport {
        source: source.clone(),
        linked: Vec::new(),
        already_linked: Vec::new(),
    };

    let targets: Vec<_> = AGENTS
        .iter()
        .filter_map(|(_, directory)| {
            let root = home.join(directory);
            root.is_dir().then(|| agent_target(&root, skill))
        })
        .collect();
    if targets.is_empty() {
        return Err("No supported agent directories found in your home directory".into());
    }

    match fs::symlink_metadata(&source) {
        Ok(metadata) if metadata.is_dir() && source.join(MARKER).is_file() => {}
        Ok(_) => {
            return Err(format!(
                "{} already exists and is not managed by renCal",
                source.display()
            ));
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Could not inspect {}: {error}", source.display())),
    }

    fs::create_dir_all(&source)
        .map_err(|error| format!("Could not create {}: {error}", source.display()))?;
    fs::write(
        source.join(MARKER),
        "Installed by renCal, which rewrites this skill on every start.\n",
    )
    .map_err(|error| format!("Could not mark {} as managed: {error}", source.display()))?;
    write_files(&source, files)?;
    for target in targets {
        // Two agents may point their skills directories at the same location.
        if fs::read_link(&target).is_ok_and(|existing| existing == source) {
            report.already_linked.push(target);
            continue;
        }
        let parent = target.parent().expect("skill path has a parent");
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        remove_existing(&target)?;
        symlink(&source, &target).map_err(|error| {
            format!(
                "Could not link {} to {}: {error}",
                target.display(),
                source.display()
            )
        })?;
        report.linked.push(target);
    }
    Ok(report)
}

/// Removes an agent's own copy of a skill: the skill is the same everywhere, so
/// renCal's replaces it. A link is removed, never what it points to.
#[cfg(unix)]
fn remove_existing(target: &Path) -> Result<(), String> {
    let removed = match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(target),
        Ok(_) => fs::remove_file(target),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not inspect {}: {error}", target.display())),
    };
    removed.map_err(|error| format!("Could not replace {}: {error}", target.display()))
}

#[cfg(unix)]
fn agents_at(home: &Path, data: &Path, skill: Skill) -> Vec<SkillAgent> {
    let source = skill_dir(data, skill);
    let installed = source.join(MARKER).is_file();
    AGENTS
        .iter()
        .filter_map(|(name, directory)| {
            let root = home.join(directory);
            if !root.is_dir() {
                return None;
            }
            let target = agent_target(&root, skill);
            // A link to a removed copy is repaired by installing again.
            let link =
                if installed && fs::read_link(&target).is_ok_and(|existing| existing == source) {
                    SkillLink::Linked
                } else {
                    SkillLink::Missing
                };
            Some(SkillAgent {
                name: (*name).into(),
                link,
            })
        })
        .collect()
}

#[cfg(unix)]
fn uninstall_at(home: &Path, data: &Path, skill: Skill) -> Result<Vec<PathBuf>, String> {
    let source = skill_dir(data, skill);
    let mut removed = Vec::new();
    for (_, directory) in AGENTS {
        let target = agent_target(&home.join(directory), skill);
        // Only links to renCal's copy; an agent's own skill stays.
        if fs::read_link(&target).is_ok_and(|existing| existing == source) {
            fs::remove_file(&target)
                .map_err(|error| format!("Could not remove {}: {error}", target.display()))?;
            removed.push(target);
        }
    }
    if source.join(MARKER).is_file() {
        fs::remove_dir_all(&source)
            .map_err(|error| format!("Could not remove {}: {error}", source.display()))?;
    }
    Ok(removed)
}

#[cfg(not(unix))]
const UNSUPPORTED: &str = "Skill installation is currently supported on Linux and macOS";

#[cfg(not(unix))]
fn install_at(
    _home: &Path,
    _data: &Path,
    _skill: Skill,
    _files: &[(&str, String)],
) -> Result<InstallReport, String> {
    Err(UNSUPPORTED.into())
}

#[cfg(not(unix))]
fn agents_at(_home: &Path, _data: &Path, _skill: Skill) -> Vec<SkillAgent> {
    Vec::new()
}

#[cfg(not(unix))]
fn uninstall_at(_home: &Path, _data: &Path, _skill: Skill) -> Result<Vec<PathBuf>, String> {
    Err(UNSUPPORTED.into())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn installs_into_existing_agents_and_can_be_rerun() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();

        let first = install_at(&home, &data, Skill::Rencal, &rencal_files()).unwrap();
        assert_eq!(first.linked.len(), 2);
        assert!(first.source.join("SKILL.md").is_file());
        assert_eq!(
            fs::read_link(home.join(".codex/skills/rencal")).unwrap(),
            first.source
        );

        let second = install_at(&home, &data, Skill::Rencal, &rencal_files()).unwrap();
        assert!(second.linked.is_empty());
        assert_eq!(second.already_linked.len(), 2);
    }

    #[test]
    fn replaces_agents_own_copies_but_not_an_unmanaged_source() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        let codex = home.join(".codex/skills/rencal");
        fs::create_dir_all(&codex).unwrap();
        fs::write(codex.join("SKILL.md"), "an older copy").unwrap();
        let elsewhere = temp.path().join("dotfiles/rencal");
        fs::create_dir_all(&elsewhere).unwrap();
        fs::write(elsewhere.join("SKILL.md"), "linked copy").unwrap();
        fs::create_dir_all(home.join(".claude/skills")).unwrap();
        let claude = home.join(".claude/skills/rencal");
        symlink(&elsewhere, &claude).unwrap();

        let report = install_at(&home, &data, Skill::Rencal, &rencal_files()).unwrap();
        assert_eq!(report.linked, [codex.clone(), claude.clone()]);
        assert_eq!(fs::read_link(&codex).unwrap(), report.source);
        assert_eq!(fs::read_link(&claude).unwrap(), report.source);
        // Replacing a link leaves what it pointed to alone.
        assert_eq!(
            fs::read_to_string(elsewhere.join("SKILL.md")).unwrap(),
            "linked copy"
        );

        let source = report.source;
        fs::remove_file(source.join(MARKER)).unwrap();
        assert!(install_at(&home, &data, Skill::Rencal, &rencal_files()).is_err());
    }

    #[test]
    fn handles_agents_sharing_a_skills_directory() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        let shared = temp.path().join("shared-skills");
        fs::create_dir_all(&shared).unwrap();
        fs::create_dir_all(home.join(".agents")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        symlink(&shared, home.join(".agents/skills")).unwrap();
        symlink(&shared, home.join(".claude/skills")).unwrap();

        let report = install_at(&home, &data, Skill::Rencal, &rencal_files()).unwrap();
        assert_eq!(report.linked.len(), 1);
        assert_eq!(report.already_linked.len(), 1);
        assert_eq!(fs::read_link(shared.join("rencal")).unwrap(), report.source);
    }

    #[test]
    fn rewriting_restores_the_built_in_files() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        fs::create_dir_all(home.join(".claude")).unwrap();
        let source = install_at(&home, &data, Skill::Rencal, &rencal_files())
            .unwrap()
            .source;
        fs::write(source.join("SKILL.md"), "from an older renCal").unwrap();

        write_files(&source, &rencal_files()).unwrap();
        assert_eq!(
            fs::read_to_string(source.join("SKILL.md")).unwrap(),
            FILES[0].1
        );
    }

    #[test]
    fn uninstall_removes_only_rencal_links() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        let links = |agents: Vec<SkillAgent>| -> Vec<_> {
            agents
                .into_iter()
                .map(|agent| (agent.name, agent.link))
                .collect()
        };

        let source = install_at(&home, &data, Skill::Rencal, &rencal_files())
            .unwrap()
            .source;
        assert_eq!(
            links(agents_at(&home, &data, Skill::Rencal)),
            [
                ("Codex".into(), SkillLink::Linked),
                ("Claude Code".into(), SkillLink::Linked)
            ]
        );
        // Someone puts their own copy back for Codex afterwards.
        let own = home.join(".codex/skills/rencal");
        fs::remove_file(&own).unwrap();
        fs::create_dir_all(&own).unwrap();

        let removed = uninstall_at(&home, &data, Skill::Rencal).unwrap();
        assert_eq!(removed, [home.join(".claude/skills/rencal")]);
        assert!(own.is_dir());
        assert!(!source.exists());
        assert_eq!(
            links(agents_at(&home, &data, Skill::Rencal)),
            [
                ("Codex".into(), SkillLink::Missing),
                ("Claude Code".into(), SkillLink::Missing)
            ]
        );
    }

    #[test]
    fn installs_each_skill_under_its_own_name() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        let own = home.join(".codex/skills/caldir");
        fs::create_dir_all(&own).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        let files = [("SKILL.md", "---\nname: caldir\n---\n".to_owned())];

        let report = install_at(&home, &data, Skill::Caldir, &files).unwrap();
        assert_eq!(report.source, data.join("rencal/agent-skills/caldir"));
        assert_eq!(
            report.linked,
            [own.clone(), home.join(".claude/skills/caldir")]
        );
        assert_eq!(fs::read_link(&own).unwrap(), report.source);
        assert_eq!(
            fs::read_link(home.join(".claude/skills/caldir")).unwrap(),
            report.source
        );
        assert!(!home.join(".claude/skills/rencal").exists());

        uninstall_at(&home, &data, Skill::Caldir).unwrap();
        assert!(!home.join(".claude/skills/caldir").exists());
    }

    #[test]
    fn accepts_only_the_caldir_skill() {
        assert!(is_caldir_skill(
            "---\nname: caldir\ndescription: Events\n---\n\n# caldir\n"
        ));
        assert!(!is_caldir_skill("<!doctype html><title>Not found</title>"));
        assert!(!is_caldir_skill("---\nname: other\n---\nname: caldir\n"));
    }

    #[test]
    fn views_guide_pins_the_bundled_sdk() {
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../packages/sdk/package.json")).unwrap();
        let sdk = package["version"].as_str().unwrap();
        let minimum = package["engines"]["rencal"]
            .as_str()
            .and_then(|range| range.strip_prefix(">="))
            .expect("packages/sdk/package.json sets engines.rencal to \">=<version>\"");

        let views = FILES
            .iter()
            .find_map(|(name, contents)| (*name == "references/views.md").then_some(*contents))
            .unwrap();
        assert!(views.contains(&format!("@rencomputer/rencal-sdk@{sdk}")));

        let readme = include_str!("../../packages/sdk/README.md");
        for (name, guide) in [("views.md", views), ("SDK README", readme)] {
            let versions: Vec<_> = guide
                .split("min_rencal_version")
                .skip(1)
                .filter_map(|rest| rest.split('"').nth(1))
                .collect();
            assert!(!versions.is_empty(), "{name} names no min_rencal_version");
            assert!(
                versions.iter().all(|version| *version == minimum),
                "{name} should require renCal {minimum}, the first release with this SDK: {versions:?}"
            );
        }
    }
}
