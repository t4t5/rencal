use std::fs;
use std::path::{Path, PathBuf};

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
const MARKER: &str = ".rencal-managed";
#[cfg(unix)]
const AGENTS: [(&str, &str); 5] = [
    ("Agent Skills", ".agents"),
    ("Codex", ".codex"),
    ("Claude", ".claude"),
    ("Pi", ".pi/agent"),
    ("Hermes", ".hermes"),
];

pub struct InstallReport {
    pub source: PathBuf,
    pub linked: Vec<PathBuf>,
    pub already_linked: Vec<PathBuf>,
    pub skipped: Vec<PathBuf>,
}

pub fn install() -> Result<InstallReport, String> {
    let home = dirs::home_dir().ok_or("Could not find your home directory")?;
    let data = dirs::data_local_dir().ok_or("Could not find your local data directory")?;
    install_at(&home, &data)
}

/// Rewrites a skill installed by `rencal skill install` from this build, so it
/// follows app updates. Does nothing when no skill is installed.
pub fn refresh() -> Result<(), String> {
    let data = dirs::data_local_dir().ok_or("Could not find your local data directory")?;
    refresh_at(&skill_dir(&data))
}

/// The whole skill as one document, for `rencal skill show`.
pub fn show() -> String {
    FILES
        .iter()
        .map(|(name, contents)| format!("==> {name} <==\n{contents}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn skill_dir(data: &Path) -> PathBuf {
    data.join("rencal/agent-skills/rencal")
}

fn refresh_at(source: &Path) -> Result<(), String> {
    if !source.join(MARKER).is_file() {
        return Ok(());
    }
    write_files(source)
}

fn write_files(source: &Path) -> Result<(), String> {
    fs::create_dir_all(source.join("references"))
        .map_err(|error| format!("Could not create {}: {error}", source.display()))?;
    for (name, contents) in FILES {
        let path = source.join(name);
        if fs::read_to_string(&path).is_ok_and(|current| current == contents) {
            continue;
        }
        fs::write(&path, contents)
            .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    }
    Ok(())
}

#[cfg(unix)]
fn install_at(home: &Path, data: &Path) -> Result<InstallReport, String> {
    use std::os::unix::fs::symlink;

    let source = skill_dir(data);
    let mut report = InstallReport {
        source: source.clone(),
        linked: Vec::new(),
        already_linked: Vec::new(),
        skipped: Vec::new(),
    };

    let targets: Vec<_> = AGENTS
        .iter()
        .filter_map(|(_, directory)| {
            let root = home.join(directory);
            root.is_dir().then(|| root.join("skills/rencal"))
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

    for target in targets {
        match fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                let existing = fs::read_link(&target)
                    .map_err(|error| format!("Could not inspect {}: {error}", target.display()))?;
                if existing == source {
                    report.already_linked.push(target);
                } else {
                    report.skipped.push(target);
                }
            }
            Ok(_) => report.skipped.push(target),
            Err(error) if error.kind() == ErrorKind::NotFound => report.linked.push(target),
            Err(error) => return Err(format!("Could not inspect {}: {error}", target.display())),
        }
    }
    if report.linked.is_empty() && report.already_linked.is_empty() {
        return Err("Every supported agent already has a different rencal skill".into());
    }

    fs::create_dir_all(&source)
        .map_err(|error| format!("Could not create {}: {error}", source.display()))?;
    fs::write(
        source.join(MARKER),
        "Installed by `rencal skill install`. renCal rewrites this skill on every start.\n",
    )
    .map_err(|error| format!("Could not mark {} as managed: {error}", source.display()))?;
    write_files(&source)?;
    let pending = std::mem::take(&mut report.linked);
    for target in pending {
        let parent = target.parent().expect("skill path has a parent");
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
        // Two agents may point their skills directories at the same location.
        if fs::symlink_metadata(&target).is_ok() {
            if fs::read_link(&target).is_ok_and(|existing| existing == source) {
                report.already_linked.push(target);
            } else {
                report.skipped.push(target);
            }
            continue;
        }
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

#[cfg(not(unix))]
fn install_at(_home: &Path, _data: &Path) -> Result<InstallReport, String> {
    Err("Skill installation is currently supported on Linux and macOS".into())
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

        let first = install_at(&home, &data).unwrap();
        assert_eq!(first.linked.len(), 2);
        assert!(first.source.join("SKILL.md").is_file());
        assert_eq!(
            fs::read_link(home.join(".codex/skills/rencal")).unwrap(),
            first.source
        );

        let second = install_at(&home, &data).unwrap();
        assert!(second.linked.is_empty());
        assert_eq!(second.already_linked.len(), 2);
    }

    #[test]
    fn preserves_other_skills_and_unmanaged_source() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        let codex = home.join(".codex/skills/rencal");
        fs::create_dir_all(&codex).unwrap();
        fs::write(codex.join("SKILL.md"), "my skill").unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();

        let report = install_at(&home, &data).unwrap();
        assert_eq!(report.skipped, vec![codex.clone()]);
        assert_eq!(
            fs::read_to_string(codex.join("SKILL.md")).unwrap(),
            "my skill"
        );

        let source = report.source;
        fs::remove_file(source.join(MARKER)).unwrap();
        assert!(install_at(&home, &data).is_err());
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

        let report = install_at(&home, &data).unwrap();
        assert_eq!(report.linked.len(), 1);
        assert_eq!(report.already_linked.len(), 1);
        assert_eq!(fs::read_link(shared.join("rencal")).unwrap(), report.source);
    }

    #[test]
    fn refresh_rewrites_only_a_managed_skill() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        let data = temp.path().join("data");
        fs::create_dir_all(home.join(".claude")).unwrap();
        let source = install_at(&home, &data).unwrap().source;
        fs::write(source.join("SKILL.md"), "from an older renCal").unwrap();

        refresh_at(&source).unwrap();
        assert_eq!(
            fs::read_to_string(source.join("SKILL.md")).unwrap(),
            FILES[0].1
        );

        let unmanaged = temp.path().join("unmanaged");
        refresh_at(&unmanaged).unwrap();
        assert!(!unmanaged.exists());
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
