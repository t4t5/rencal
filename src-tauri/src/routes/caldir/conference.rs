use caldir_core::{Calendar, Event, XProperty};

use super::types::{ConferenceProvider, EventConference};

pub const GOOGLE_MEET_X_PROP: &str = "X-GOOGLE-CONFERENCE";
const OUTLOOK_MEET_X_PROP: &str = "X-OUTLOOK-CONFERENCE";
const PROTON_MEET_X_PROP: &str = "X-PM-CONFERENCE-URL";

const CONFERENCE_X_PROPS: [(&str, ConferenceProvider); 3] = [
    (GOOGLE_MEET_X_PROP, ConferenceProvider::Google),
    (OUTLOOK_MEET_X_PROP, ConferenceProvider::Outlook),
    (PROTON_MEET_X_PROP, ConferenceProvider::Proton),
];

pub fn conference_from_event(event: &Event) -> Option<EventConference> {
    CONFERENCE_X_PROPS.iter().find_map(|(property, provider)| {
        event.x_property(property).map(|value| match value {
            // If key exists but value is empty:
            // -> conference was requested but not yet created
            "" => EventConference::Requested {
                provider: *provider,
            },
            url => EventConference::Live {
                provider: *provider,
                url: url.to_string(),
            },
        })
    })
}

pub fn apply_conference_request(event: &mut Event, calendar: &Calendar, requested: bool) {
    let is_google = calendar
        .remote_config()
        .is_some_and(|config| config.provider_slug().as_str() == "google");

    if requested && is_google && event.x_property(GOOGLE_MEET_X_PROP).is_none() {
        event
            .x_properties
            .push(XProperty::new(GOOGLE_MEET_X_PROP, ""));
    } else if !requested {
        event
            .x_properties
            .retain(|property| !(property.name == GOOGLE_MEET_X_PROP && property.value.is_empty()));
    }
}
