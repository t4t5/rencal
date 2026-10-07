//! Calendar groups (port of `src/lib/calendar-groups.ts`): named sets of
//! calendars from the config (`[groups]`), one of which is active.

use std::collections::{BTreeMap, HashSet};

use rencal_time::Calendar;

/// The group shown when none is chosen. Without its own config entry it shows
/// every calendar.
pub const DEFAULT_GROUP: &str = "default";

/// Group name → calendar slugs. Sorted by name, which is the picker order.
pub type CalendarGroups = BTreeMap<String, Vec<String>>;

/// Drop entries without a slug list (a config value that isn't an array).
pub fn normalize_calendar_groups(
    groups: impl IntoIterator<Item = (String, Option<Vec<String>>)>,
) -> CalendarGroups {
    groups
        .into_iter()
        .filter_map(|(name, slugs)| Some((name, slugs?)))
        .collect()
}

/// Selectable group names: "default" first, the rest in code-point order.
pub fn group_options(groups: &CalendarGroups) -> Vec<String> {
    std::iter::once(DEFAULT_GROUP.to_owned())
        .chain(groups.keys().filter(|name| *name != DEFAULT_GROUP).cloned())
        .collect()
}

/// Capitalise for display; group names are lowercase config keys ("work").
pub fn format_group_name(name: &str) -> String {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// The active group from its stored form, a JSON string. Anything else
/// (missing, malformed, not a string) falls back to the default group.
pub fn stored_active_group(stored: Option<&str>) -> String {
    stored
        .and_then(|raw| serde_json::from_str::<String>(raw).ok())
        .unwrap_or_else(|| DEFAULT_GROUP.to_owned())
}

/// Slugs of the calendars shown for `active_group`, in calendar order. A group
/// without an entry (the default group, or an unknown name) shows everything;
/// slugs in a group that match no calendar are ignored.
pub fn visible_calendar_slugs(
    calendars: &[Calendar],
    groups: &CalendarGroups,
    active_group: &str,
) -> Vec<String> {
    let all = calendars.iter().map(|c| c.slug.clone());
    match groups.get(active_group) {
        None => all.collect(),
        Some(slugs) => {
            let allowed: HashSet<&str> = slugs.iter().map(String::as_str).collect();
            all.filter(|slug| allowed.contains(slug.as_str())).collect()
        }
    }
}
