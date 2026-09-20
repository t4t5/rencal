// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::{OsStr, OsString};
use std::process::ExitCode;

const PLUGIN_INSTALL_USAGE: &str = "usage: rencal plugin install <owner/repo-or-github-url>";

#[derive(Debug, Eq, PartialEq)]
enum Command {
    LaunchApp,
    InstallPlugin(String),
}

fn command_from_args(mut args: impl Iterator<Item = OsString>) -> Result<Command, ()> {
    let Some(command) = args.next() else {
        return Ok(Command::LaunchApp);
    };
    if command != "plugin" {
        // Preserve the existing handling of deep links and platform-injected
        // arguments by passing every command other than `plugin` to Tauri.
        return Ok(Command::LaunchApp);
    }

    if args.next().as_deref() != Some(OsStr::new("install")) {
        return Err(());
    }

    let repository = args.next().and_then(|value| value.into_string().ok());
    match (repository, args.next()) {
        (Some(repository), None) => Ok(Command::InstallPlugin(repository)),
        _ => Err(()),
    }
}

fn install_plugin(repository: &str) -> Result<rencal_lib::plugins::PluginInspection, String> {
    let manager =
        rencal_lib::plugins::PluginManager::system().map_err(|error| error.to_string())?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    runtime
        .block_on(manager.install(repository))
        .map_err(|error| error.to_string())
}

fn main() -> ExitCode {
    match command_from_args(std::env::args_os().skip(1)) {
        Ok(Command::LaunchApp) => {
            rencal_lib::run();
            ExitCode::SUCCESS
        }
        Ok(Command::InstallPlugin(repository)) => match install_plugin(&repository) {
            Ok(plugin) => {
                println!(
                    "Installed {} ({}) v{}",
                    plugin.name, plugin.id, plugin.version
                );
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("Could not install plugin: {error}");
                ExitCode::FAILURE
            }
        },
        Err(()) => {
            eprintln!("{PLUGIN_INSTALL_USAGE}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> impl Iterator<Item = OsString> {
        values
            .iter()
            .map(|value| OsString::from(*value))
            .collect::<Vec<_>>()
            .into_iter()
    }

    #[test]
    fn no_arguments_launches_the_app() {
        assert_eq!(command_from_args(args(&[])), Ok(Command::LaunchApp));
    }

    #[test]
    fn plugin_install_requires_exactly_one_repository() {
        assert_eq!(
            command_from_args(args(&["plugin", "install", "alice/rencal-dusk"])),
            Ok(Command::InstallPlugin("alice/rencal-dusk".into()))
        );
        assert!(command_from_args(args(&["plugin", "install"])).is_err());
        assert!(command_from_args(args(&["plugin", "install", "alice/dusk", "extra"])).is_err());
    }

    #[test]
    fn plugin_requires_a_known_subcommand() {
        assert!(command_from_args(args(&["plugin"])).is_err());
        assert!(command_from_args(args(&["plugin", "unknown"])).is_err());
    }

    #[test]
    fn other_arguments_keep_the_existing_app_launch_behavior() {
        assert_eq!(
            command_from_args(args(&["rencal://event/123"])),
            Ok(Command::LaunchApp)
        );
        assert_eq!(
            command_from_args(args(&["install", "alice/rencal-dusk"])),
            Ok(Command::LaunchApp)
        );
    }
}
