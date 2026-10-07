//! Attendee suggestions (port of `src/lib/contact-suggestions.ts`).

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

/// A known contact, as `list_contacts` returns it (most frequent first).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Contact {
    pub email: String,
    #[serde(default)]
    pub name: Option<String>,
    pub count: u32,
    /// RFC 3339 timestamp of the last event the contact appeared in.
    pub last_seen: String,
}

/// How many suggestions the attendee input shows.
pub const DEFAULT_SUGGESTION_LIMIT: usize = 8;

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

/// 0 for an email or name-word prefix match, 1 for a substring match.
fn match_rank(contact: &Contact, query: &str) -> Option<u8> {
    let email = contact.email.to_lowercase();
    let name = contact
        .name
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_default();

    if email.starts_with(query) || name.split_whitespace().any(|w| w.starts_with(query)) {
        Some(0)
    } else if email.contains(query) || name.contains(query) {
        Some(1)
    } else {
        None
    }
}

/// Contacts matching `query`, prefix matches first, otherwise in the given
/// order. Contacts whose email is invalid or already in `exclude_emails`
/// (compared trimmed and case-insensitively) are skipped.
pub fn suggest_contacts<'a>(
    contacts: &'a [Contact],
    query: &str,
    exclude_emails: impl IntoIterator<Item = impl AsRef<str>>,
    limit: usize,
) -> Vec<&'a Contact> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Vec::new();
    }
    let excluded: HashSet<String> = exclude_emails
        .into_iter()
        .map(|e| normalize_email(e.as_ref()))
        .filter(|e| !e.is_empty())
        .collect();

    let mut ranked: Vec<(u8, &Contact)> = contacts
        .iter()
        .filter_map(|c| Some((match_rank(c, &query)?, c)))
        .filter(|(_, c)| {
            is_valid_contact_email(&c.email) && !excluded.contains(&normalize_email(&c.email))
        })
        .collect();
    // Stable, so equal ranks keep the backend's order.
    ranked.sort_by_key(|(rank, _)| *rank);
    ranked.into_iter().take(limit).map(|(_, c)| c).collect()
}

/// `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` on the trimmed, lowercased email: one `@`,
/// no whitespace, and a dot inside the domain.
pub fn is_valid_contact_email(email: &str) -> bool {
    let email = normalize_email(email);
    if email.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.contains('@')
        && domain
            .char_indices()
            .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
}
