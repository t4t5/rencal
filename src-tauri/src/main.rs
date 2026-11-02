// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::{OsStr, OsString};
use std::process::ExitCode;

use rencal_lib::control::CommandInvocation;
use rencal_lib::skill_install::{self, Skill};

mod commands_cli;

const PLUGIN_INSTALL_USAGE: &str = "usage: rencal plugin install <owner/repo-or-github-url>";
const SKILL_USAGE: &str = "usage: rencal skill <install|uninstall|show>";
const DO_USAGE: &str = "usage: rencal do <command> [value] [--<argument> <value>]...\n\
                        `rencal commands` lists the commands";
const COMMANDS_USAGE: &str = "usage: rencal commands";

#[derive(Debug, Eq, PartialEq)]
enum Command {
    LaunchApp,
    InstallPlugin(String),
    InstallSkill,
    UninstallSkill,
    ShowSkill,
    Run(CommandInvocation),
    ListCommands,
}

/// `rencal do <command> [value] [--name value | --name=value]...`
fn invocation_from_args(
    mut args: impl Iterator<Item = OsString>,
) -> Result<CommandInvocation, &'static str> {
    let mut args = std::iter::from_fn(move || args.next().map(|arg| arg.into_string()));
    let Some(Ok(command)) = args.next() else {
        return Err(DO_USAGE);
    };
    if command.starts_with('-') {
        return Err(DO_USAGE);
    }
    let mut invocation = CommandInvocation {
        command,
        ..Default::default()
    };
    while let Some(arg) = args.next() {
        let arg = arg.map_err(|_| DO_USAGE)?;
        if let Some(name) = arg.strip_prefix("--") {
            let (name, value) = match name.split_once('=') {
                Some((name, value)) => (name.to_string(), value.to_string()),
                None => match args.next() {
                    Some(Ok(value)) => (name.to_string(), value),
                    _ => return Err(DO_USAGE),
                },
            };
            if name.is_empty() || invocation.args.insert(name, value).is_some() {
                return Err(DO_USAGE);
            }
        } else if invocation.value.replace(arg).is_some() {
            return Err(DO_USAGE);
        }
    }
    Ok(invocation)
}

fn command_from_args(mut args: impl Iterator<Item = OsString>) -> Result<Command, &'static str> {
    let Some(command) = args.next() else {
        return Ok(Command::LaunchApp);
    };
    if command == "skill" {
        return match (args.next(), args.next()) {
            (Some(action), None) if action == "install" => Ok(Command::InstallSkill),
            (Some(action), None) if action == "uninstall" => Ok(Command::UninstallSkill),
            (Some(action), None) if action == "show" => Ok(Command::ShowSkill),
            _ => Err(SKILL_USAGE),
        };
    }
    if command == "do" {
        return invocation_from_args(args).map(Command::Run);
    }
    if command == "commands" {
        return match args.next() {
            None => Ok(Command::ListCommands),
            Some(_) => Err(COMMANDS_USAGE),
        };
    }
    if command != "plugin" {
        // Preserve the existing handling of deep links and platform-injected
        // arguments by passing every command other than `plugin` to Tauri.
        return Ok(Command::LaunchApp);
    }

    if args.next().as_deref() != Some(OsStr::new("install")) {
        return Err(PLUGIN_INSTALL_USAGE);
    }

    let repository = args.next().and_then(|value| value.into_string().ok());
    match (repository, args.next()) {
        (Some(repository), None) => Ok(Command::InstallPlugin(repository)),
        _ => Err(PLUGIN_INSTALL_USAGE),
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
                    "Installed {} ({}) {}",
                    plugin.name, plugin.id, plugin.version
                );
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("Could not install plugin: {error}");
                ExitCode::FAILURE
            }
        },
        Ok(Command::InstallSkill) => {
            match skill_install::install(Skill::Rencal, &skill_install::rencal_files()) {
                Ok(report) => {
                    println!("renCal skill installed at {}", report.source.display());
                    for path in report.linked {
                        println!("Linked {}", path.display());
                    }
                    for path in report.already_linked {
                        println!("Already linked {}", path.display());
                    }
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("Could not install skill: {error}");
                    ExitCode::FAILURE
                }
            }
        }
        Ok(Command::UninstallSkill) => match skill_install::uninstall(Skill::Rencal) {
            Ok(removed) => {
                println!("renCal skill removed");
                for path in removed {
                    println!("Unlinked {}", path.display());
                }
                ExitCode::SUCCESS
            }
            Err(error) => {
                eprintln!("Could not uninstall skill: {error}");
                ExitCode::FAILURE
            }
        },
        Ok(Command::ShowSkill) => {
            print!("{}", skill_install::show());
            ExitCode::SUCCESS
        }
        Ok(Command::Run(invocation)) => commands_cli::run(&invocation),
        Ok(Command::ListCommands) => commands_cli::list(),
        Err(usage) => {
            eprintln!("{usage}");
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
    fn skill_commands_take_no_other_arguments() {
        assert_eq!(
            command_from_args(args(&["skill", "install"])),
            Ok(Command::InstallSkill)
        );
        assert_eq!(
            command_from_args(args(&["skill", "uninstall"])),
            Ok(Command::UninstallSkill)
        );
        assert_eq!(
            command_from_args(args(&["skill", "show"])),
            Ok(Command::ShowSkill)
        );
        assert_eq!(command_from_args(args(&["skill"])), Err(SKILL_USAGE));
        assert_eq!(
            command_from_args(args(&["skill", "install", "extra"])),
            Err(SKILL_USAGE)
        );
        assert_eq!(
            command_from_args(args(&["skill", "unknown"])),
            Err(SKILL_USAGE)
        );
    }

    fn invocation(command: &str, value: Option<&str>, args: &[(&str, &str)]) -> Command {
        Command::Run(CommandInvocation {
            command: command.into(),
            value: value.map(Into::into),
            args: args
                .iter()
                .map(|(name, value)| (name.to_string(), value.to_string()))
                .collect(),
        })
    }

    #[test]
    fn do_takes_a_command_a_value_and_named_arguments() {
        assert_eq!(
            command_from_args(args(&["do", "date.today"])),
            Ok(invocation("date.today", None, &[]))
        );
        assert_eq!(
            command_from_args(args(&["do", "date.go", "2026-11-02"])),
            Ok(invocation("date.go", Some("2026-11-02"), &[]))
        );
        assert_eq!(
            command_from_args(args(&["do", "date.next", "--unit", "week"])),
            Ok(invocation("date.next", None, &[("unit", "week")]))
        );
        assert_eq!(
            command_from_args(args(&["do", "date.next", "--unit=week"])),
            Ok(invocation("date.next", None, &[("unit", "week")]))
        );
    }

    #[test]
    fn do_rejects_malformed_arguments() {
        assert_eq!(command_from_args(args(&["do"])), Err(DO_USAGE));
        assert_eq!(
            command_from_args(args(&["do", "--unit", "day"])),
            Err(DO_USAGE)
        );
        assert_eq!(
            command_from_args(args(&["do", "date.go", "a", "b"])),
            Err(DO_USAGE)
        );
        assert_eq!(
            command_from_args(args(&["do", "date.next", "--unit"])),
            Err(DO_USAGE)
        );
        assert_eq!(
            command_from_args(args(&["do", "date.next", "--unit", "a", "--unit", "b"])),
            Err(DO_USAGE)
        );
    }

    #[test]
    fn commands_takes_no_arguments() {
        assert_eq!(
            command_from_args(args(&["commands"])),
            Ok(Command::ListCommands)
        );
        assert_eq!(
            command_from_args(args(&["commands", "extra"])),
            Err(COMMANDS_USAGE)
        );
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
