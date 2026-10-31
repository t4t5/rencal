//! `rencal do` and `rencal commands`: run app commands in the running renCal.

use std::fmt::Write;
use std::process::ExitCode;

use rencal_lib::control::CommandInvocation;
use serde::Deserialize;

/// The result of `app.commands`: the frontend's command registry.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandList {
    commands: Vec<CommandInfo>,
    /// Entries of keys.toml that were skipped, and why.
    key_errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CommandInfo {
    id: String,
    label: String,
    args: Vec<ArgInfo>,
    keys: Vec<KeyInfo>,
}

#[derive(Debug, Deserialize)]
struct ArgInfo {
    name: String,
    description: String,
    required: bool,
    values: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct KeyInfo {
    keys: String,
    value: Option<String>,
}

/// The command's JSON result, if it returned one.
fn send(invocation: &CommandInvocation) -> Result<Option<String>, String> {
    #[cfg(unix)]
    {
        use rencal_lib::control::{self, CommandOutcome};
        match control::send(invocation)? {
            CommandOutcome::Ok { result } => Ok(result),
            CommandOutcome::Error { message } => Err(message),
        }
    }
    #[cfg(not(unix))]
    {
        let _ = invocation;
        Err("`rencal do` isn't available on this platform yet".into())
    }
}

/// Strings print bare so scripts can use them; anything else as JSON.
fn display_result(result: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(result) {
        Ok(serde_json::Value::String(text)) => text,
        Ok(value) => serde_json::to_string_pretty(&value).unwrap_or_else(|_| result.into()),
        Err(_) => result.into(),
    }
}

pub fn run(invocation: &CommandInvocation) -> ExitCode {
    match send(invocation) {
        Ok(result) => {
            if let Some(result) = result {
                println!("{}", display_result(&result));
            }
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

fn format_commands(
    CommandList {
        commands,
        key_errors,
    }: &CommandList,
) -> String {
    let mut out = String::from(
        "Run a command with `rencal do <command> [value] [--<argument> <value>]`; \
         the value fills its first argument.\n\n",
    );
    for command in commands {
        let mut signature = command.id.clone();
        for arg in &command.args {
            if arg.required {
                let _ = write!(signature, " <{}>", arg.name);
            } else {
                let _ = write!(signature, " [{}]", arg.name);
            }
        }
        let _ = writeln!(out, "{signature:<28} {}", command.label);
        for arg in &command.args {
            let _ = write!(out, "    {}: {}", arg.name, arg.description);
            if !arg.values.is_empty() {
                let _ = write!(out, " ({})", arg.values.join(", "));
            }
            out.push('\n');
        }
        if !command.keys.is_empty() {
            let keys: Vec<String> = command
                .keys
                .iter()
                .map(|key| match &key.value {
                    Some(value) => format!("{} ({value})", key.keys),
                    None => key.keys.clone(),
                })
                .collect();
            let _ = writeln!(out, "    keys: {}", keys.join(", "));
        }
    }
    out.push_str("\nRebind keys in ~/.config/rencal/keys.toml, e.g. `w = \"view.switch:week\"`.\n");
    if !key_errors.is_empty() {
        out.push_str("\nProblems in keys.toml (renCal skips what it can't use):\n");
        for error in key_errors {
            let _ = writeln!(out, "  {error}");
        }
    }
    out
}

pub fn list() -> ExitCode {
    let invocation = CommandInvocation {
        command: "app.commands".into(),
        ..Default::default()
    };
    let commands = send(&invocation).and_then(|result| {
        serde_json::from_str::<CommandList>(result.as_deref().unwrap_or_default())
            .map_err(|error| format!("renCal sent an invalid command list: {error}"))
    });
    match commands {
        Ok(commands) => {
            print!("{}", format_commands(&commands));
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strings_print_bare_and_other_results_as_json() {
        assert_eq!(display_result("\"2026-11-02\""), "2026-11-02");
        assert_eq!(display_result("{\"a\":1}"), "{\n  \"a\": 1\n}");
    }

    #[test]
    fn lists_arguments_values_and_keys() {
        let list: CommandList = serde_json::from_str(
            r#"{ "commands": [
              { "id": "date.next", "label": "Next", "keys": [
                  { "keys": "l", "value": "day" }, { "keys": "ctrl+d", "value": "month" }
                ],
                "args": [{ "name": "unit", "description": "How far", "required": true,
                           "values": ["day", "week", "month"] }] },
              { "id": "app.sync", "label": "Sync now", "args": [], "keys": [] }
            ], "keyErrors": ["keys.toml: unknown command \"nope\""] }"#,
        )
        .unwrap();
        let text = format_commands(&list);
        assert!(text.contains("date.next <unit>"));
        assert!(text.contains("    unit: How far (day, week, month)\n"));
        assert!(text.contains("    keys: l (day), ctrl+d (month)\n"));
        assert!(text.contains("app.sync"));
        assert!(text.contains("  keys.toml: unknown command \"nope\"\n"));
    }
}
