---
title: Keyboard Shortcuts
description: How to navigate renCal as a power user
---

Press <kbd>?</kbd> in the app to see all shortcuts.

## Navigation

| Action         | Shortcut                       |
| -------------- | ------------------------------ |
| Next day       | <kbd>→</kbd> or <kbd>l</kbd>   |
| Previous day   | <kbd>←</kbd> or <kbd>h</kbd>   |
| Next week      | <kbd>↓</kbd> or <kbd>j</kbd>   |
| Previous week  | <kbd>↑</kbd> or <kbd>k</kbd>   |
| Next month     | <kbd>Ctrl</kbd><kbd>D</kbd>    |
| Previous month | <kbd>Ctrl</kbd><kbd>U</kbd>    |
| Next event     | <kbd>Tab</kbd>                 |
| Previous event | <kbd>Shift</kbd><kbd>Tab</kbd> |
| Go to today    | <kbd>t</kbd>                   |
| Go to a date   | <kbd>.</kbd>                   |

## View

| Action                | Shortcut     |
| --------------------- | ------------ |
| Display week view     | <kbd>w</kbd> |
| Display month view    | <kbd>m</kbd> |
| Display year view     | <kbd>y</kbd> |
| Switch calendar group | <kbd>g</kbd> |

## General

| Action                           | Shortcut                                    |
| -------------------------------- | ------------------------------------------- |
| Search events                    | <kbd>/</kbd> or <kbd>Ctrl</kbd><kbd>F</kbd> |
| Compose a new event              | <kbd>c</kbd>                                |
| Add an event to the selected day | <kbd>a</kbd>                                |
| Toggle invitations               | <kbd>i</kbd>                                |
| Open settings                    | <kbd>Ctrl</kbd><kbd>,</kbd>                 |
| Cycle through themes             | <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>T</kbd> |
| Show keyboard shortcuts          | <kbd>?</kbd>                                |
| Open the command palette         | <kbd>Ctrl</kbd><kbd>K</kbd>                 |

## Change keys

Rebind keys in `~/.config/rencal/keys.toml`. Each entry maps a key to a command, and renCal picks up changes as you save:

```toml
[keys]
w = "view.switch:week"
n = "date.next:day"
"mod+n" = "event.new"
b = "view.switch:t4t5.board/board"
"ctrl+b" = false # unbind
```

A key you bind replaces what it did before, and `false` turns a key off. The other keys of a command keep working. Write keys as `ctrl`, `alt`, `shift` or `meta` plus a key, and `mod` for <kbd>Cmd</kbd> on macOS and <kbd>Ctrl</kbd> elsewhere. Single characters like `w` or `?` match what you type on any keyboard layout. Problems in the file are listed at the top of the shortcuts panel (<kbd>?</kbd>).

## Run commands from the terminal

Every key, menu item and palette entry runs a command, and on Linux you can run the same commands while renCal is open:

```sh
rencal do date.go "next friday"
rencal do view.switch week
rencal do date.next --unit week
rencal commands # every command, its arguments and keys
```

A value after the command fills its first argument, like `:week` does in `keys.toml`. `rencal do` prints the command's result if it has one (`date.*` commands print the date they show), and exits with an error message when the command can't run.
