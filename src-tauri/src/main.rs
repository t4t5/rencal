// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsString;
use std::process::ExitCode;

const INSTALL_USAGE: &str = "usage: rencal install <owner/repo-or-github-url>";

#[derive(Debug, Eq, PartialEq)]
enum Command {
    LaunchApp,
    Install(String),
}

fn command_from_args(mut args: impl Iterator<Item = OsString>) -> Result<Command, ()> {
    let Some(command) = args.next() else {
        return Ok(Command::LaunchApp);
    };
    if command != "install" {
        // Preserve the existing handling of deep links and platform-injected
        // arguments by passing every command other than `install` to Tauri.
        return Ok(Command::LaunchApp);
    }

    let repository = args.next().and_then(|value| value.into_string().ok());
    match (repository, args.next()) {
        (Some(repository), None) => Ok(Command::Install(repository)),
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
        Ok(Command::Install(repository)) => match install_plugin(&repository) {
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
            eprintln!("{INSTALL_USAGE}");
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
    fn install_requires_exactly_one_repository() {
        assert_eq!(
            command_from_args(args(&["install", "alice/rencal-dusk"])),
            Ok(Command::Install("alice/rencal-dusk".into()))
        );
        assert!(command_from_args(args(&["install"])).is_err());
        assert!(command_from_args(args(&["install", "alice/dusk", "extra"])).is_err());
    }

    #[test]
    fn other_arguments_keep_the_existing_app_launch_behavior() {
        assert_eq!(
            command_from_args(args(&["rencal://event/123"])),
            Ok(Command::LaunchApp)
        );
    }
}
