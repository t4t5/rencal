use super::helpers::load_caldir;
use super::types::Contact;
use crate::event_cache::EVENT_CACHE;
use crate::routes::TauResult;
use caldir_core::{Attendee, Event};
use chrono::{DateTime, Utc};
use std::collections::{HashMap, HashSet};

#[derive(Clone)]
struct ContactAgg {
    email: String,
    name: Option<String>,
    count: u32,
    last_seen: DateTime<Utc>,
}

pub(super) async fn handler() -> TauResult<Vec<Contact>> {
    let caldir = load_caldir()?;
    let calendars: Vec<_> = caldir.calendars().into_iter().filter_map(Result::ok).collect();

    let own_addresses: HashSet<String> = calendars
        .iter()
        .filter_map(|calendar| calendar.remote_email())
        .map(normalize_email)
        .filter(|email| !email.is_empty())
        .collect();

    let mut contacts: HashMap<String, ContactAgg> = HashMap::new();
    let mut counted_events: HashSet<(String, String)> = HashSet::new();

    for calendar in calendars {
        let Some(slug) = calendar.slug() else {
            continue;
        };

        let events = EVENT_CACHE.events(&caldir, slug)?;
        for event in events.iter() {
            fold_event_contacts(event, &own_addresses, &mut contacts, &mut counted_events);
        }
    }

    let mut contacts: Vec<Contact> = contacts
        .into_values()
        .map(|contact| Contact {
            email: contact.email,
            name: contact.name,
            count: contact.count,
            last_seen: contact.last_seen.date_naive().format("%F").to_string(),
        })
        .collect();

    contacts.sort_by(|a, b| {
        b.count
            .cmp(&a.count)
            .then_with(|| b.last_seen.cmp(&a.last_seen))
            .then_with(|| a.email.cmp(&b.email))
    });

    Ok(contacts)
}

fn fold_event_contacts(
    event: &Event,
    own_addresses: &HashSet<String>,
    contacts: &mut HashMap<String, ContactAgg>,
    counted_events: &mut HashSet<(String, String)>,
) {
    if let Some(organizer) = &event.organizer {
        fold_contact(
            &organizer.email,
            organizer.name.as_deref(),
            event,
            own_addresses,
            contacts,
            counted_events,
        );
    }

    for attendee in &event.attendees {
        fold_attendee(attendee, event, own_addresses, contacts, counted_events);
    }
}

fn fold_attendee(
    attendee: &Attendee,
    event: &Event,
    own_addresses: &HashSet<String>,
    contacts: &mut HashMap<String, ContactAgg>,
    counted_events: &mut HashSet<(String, String)>,
) {
    fold_contact(
        &attendee.email,
        attendee.name.as_deref(),
        event,
        own_addresses,
        contacts,
        counted_events,
    );
}

fn fold_contact(
    raw_email: &str,
    raw_name: Option<&str>,
    event: &Event,
    own_addresses: &HashSet<String>,
    contacts: &mut HashMap<String, ContactAgg>,
    counted_events: &mut HashSet<(String, String)>,
) {
    let email = normalize_email(raw_email);
    if email.is_empty() || own_addresses.contains(&email) {
        return;
    }

    let event_start = event.start.to_utc();
    let event_uid = event.uid.as_str().to_string();
    let count_key = (email.clone(), event_uid);
    let count_increment = counted_events.insert(count_key);
    let name = raw_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned);

    contacts
        .entry(email.clone())
        .and_modify(|contact| {
            if count_increment {
                contact.count += 1;
            }
            if event_start >= contact.last_seen {
                contact.last_seen = event_start;
                if let Some(name) = &name {
                    contact.name = Some(name.clone());
                }
            }
        })
        .or_insert_with(|| ContactAgg {
            email,
            name,
            count: u32::from(count_increment),
            last_seen: event_start,
        });
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}
