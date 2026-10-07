//! Calendar group edits (the logic of `GroupsColumn.tsx` and
//! `CalendarsColumn.tsx`). Groups are `[groups]` in renCal's `config.toml`:
//! a name and the calendar slugs it shows. "default" is the built-in group;
//! absent, it shows every calendar.

use std::collections::BTreeMap;

pub type Groups = BTreeMap<String, Vec<String>>;

pub const DEFAULT_GROUP: &str = "default";

/// "default" first, then the named groups alphabetically.
pub fn group_names(groups: &Groups) -> Vec<String> {
    std::iter::once(DEFAULT_GROUP.to_owned())
        .chain(groups.keys().filter(|name| *name != DEFAULT_GROUP).cloned())
        .collect()
}

pub fn display_name(group: &str) -> &str {
    if group == DEFAULT_GROUP {
        "Default"
    } else {
        group
    }
}

/// The calendars `group` shows: its list, or every calendar.
pub fn group_calendars(groups: &Groups, group: &str, all: &[String]) -> Vec<String> {
    groups.get(group).cloned().unwrap_or_else(|| all.to_vec())
}

/// Shows or hides calendar `slug` in `group`. A default group showing every
/// calendar is dropped again, so new calendars keep showing in it.
pub fn set_calendar_enabled(
    groups: &Groups,
    group: &str,
    all: &[String],
    slug: &str,
    enabled: bool,
) -> Groups {
    let mut slugs = group_calendars(groups, group, all);
    slugs.retain(|s| s != slug);
    if enabled {
        slugs.push(slug.to_owned());
    }
    let mut next = groups.clone();
    if group == DEFAULT_GROUP && slugs.len() == all.len() {
        next.remove(DEFAULT_GROUP);
    } else {
        next.insert(group.to_owned(), slugs);
    }
    next
}

/// A new group shows every calendar.
pub fn create_group(groups: &Groups, name: &str, all: &[String]) -> Groups {
    let mut next = groups.clone();
    next.insert(name.to_owned(), all.to_vec());
    next
}

pub fn rename_group(groups: &Groups, old: &str, new: &str, all: &[String]) -> Groups {
    let mut next = groups.clone();
    let calendars = next.remove(old).unwrap_or_else(|| all.to_vec());
    next.insert(new.to_owned(), calendars);
    next
}

pub fn delete_group(groups: &Groups, name: &str) -> Groups {
    let mut next = groups.clone();
    next.remove(name);
    next
}

/// Why `name` can't be used for a group, if it can't. `initial` is the
/// group being renamed, which may keep its name.
pub fn group_name_error(name: &str, names: &[String], initial: &str) -> Option<&'static str> {
    let normalized = name.trim().to_lowercase();
    let initial = initial.trim().to_lowercase();
    if normalized == DEFAULT_GROUP {
        return Some("Default is reserved.");
    }
    let taken = names
        .iter()
        .map(|group| group.to_lowercase())
        .any(|group| group != initial && group == normalized);
    taken.then_some("A group with this name already exists.")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slugs(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_owned()).collect()
    }

    #[test]
    fn default_group_drops_back_to_every_calendar() {
        let all = slugs(&["work", "home"]);
        let hidden = set_calendar_enabled(&Groups::new(), DEFAULT_GROUP, &all, "home", false);
        assert_eq!(hidden.get(DEFAULT_GROUP), Some(&slugs(&["work"])));
        let shown = set_calendar_enabled(&hidden, DEFAULT_GROUP, &all, "home", true);
        assert!(shown.is_empty());
    }

    #[test]
    fn named_groups_keep_their_list() {
        let all = slugs(&["work", "home"]);
        let groups = create_group(&Groups::new(), "Focus", &all);
        let groups = set_calendar_enabled(&groups, "Focus", &all, "home", false);
        let groups = set_calendar_enabled(&groups, "Focus", &all, "home", true);
        assert_eq!(groups.get("Focus"), Some(&slugs(&["work", "home"])));
        let renamed = rename_group(&groups, "Focus", "Deep", &all);
        assert!(renamed.get("Focus").is_none());
        assert_eq!(renamed.get("Deep"), Some(&slugs(&["work", "home"])));
        assert!(delete_group(&renamed, "Deep").is_empty());
        assert_eq!(group_names(&renamed), slugs(&["default", "Deep"]));
    }

    #[test]
    fn group_names_are_unique_and_default_is_reserved() {
        let names = slugs(&["default", "Focus"]);
        assert_eq!(
            group_name_error(" DEFAULT ", &names, ""),
            Some("Default is reserved.")
        );
        assert_eq!(
            group_name_error("focus", &names, ""),
            Some("A group with this name already exists.")
        );
        assert_eq!(group_name_error("focus", &names, "Focus"), None);
        assert_eq!(group_name_error("Travel", &names, ""), None);
    }
}
