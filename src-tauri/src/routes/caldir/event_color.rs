use caldir_core::{Event, XProperty};

use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

const GOOGLE_COLOR_ID_PROP: &str = "X-GOOGLE-COLOR-ID";

/// Google Calendar's event colors by `colorId`, from the API's `colors.get`.
const GOOGLE_EVENT_COLORS: [(&str, &str); 11] = [
    ("1", "#7986cb"),
    ("2", "#33b679"),
    ("3", "#8e24aa"),
    ("4", "#e67c73"),
    ("5", "#f6bf26"),
    ("6", "#f4511e"),
    ("7", "#039be5"),
    ("8", "#616161"),
    ("9", "#3f51b5"),
    ("10", "#0b8043"),
    ("11", "#d50000"),
];

pub fn event_color(event: &Event) -> Option<String> {
    let id = event.x_property(GOOGLE_COLOR_ID_PROP)?;
    GOOGLE_EVENT_COLORS
        .iter()
        .find(|(color_id, _)| *color_id == id)
        .map(|(_, hex)| hex.to_string())
}

/// Resolve an event color to its Google `colorId`; `None` uses the calendar's.
pub fn color_id(color: Option<&str>) -> TauResult<Option<&'static str>> {
    color
        .map(|color| {
            GOOGLE_EVENT_COLORS
                .iter()
                .find(|(_, hex)| hex.eq_ignore_ascii_case(color))
                .map(|(id, _)| *id)
                .ok_or_else(|| {
                    RpcError::new(
                        RpcErrorKind::InvalidInput,
                        format!("Unsupported event color: {color}"),
                    )
                })
        })
        .transpose()
}

pub fn apply_color_id(event: &mut Event, color_id: Option<&str>) {
    event
        .x_properties
        .retain(|property| property.name != GOOGLE_COLOR_ID_PROP);
    if let Some(id) = color_id {
        event
            .x_properties
            .push(XProperty::new(GOOGLE_COLOR_ID_PROP, id));
    }
}

#[cfg(test)]
mod tests {
    use caldir_core::EventTime;
    use chrono::NaiveDate;

    use super::*;

    fn event() -> Event {
        Event::new(
            "Planning",
            EventTime::Date(NaiveDate::from_ymd_opt(2026, 7, 24).unwrap()),
        )
    }

    #[test]
    fn applied_colors_round_trip_through_the_google_color_id() {
        let mut event = event();
        apply_color_id(&mut event, color_id(Some("#F6BF26")).unwrap());
        assert_eq!(event.x_property(GOOGLE_COLOR_ID_PROP), Some("5"));
        assert_eq!(event_color(&event).as_deref(), Some("#f6bf26"));

        apply_color_id(&mut event, color_id(Some("#d50000")).unwrap());
        assert_eq!(event.x_property(GOOGLE_COLOR_ID_PROP), Some("11"));
        assert_eq!(event.x_properties.len(), 1);

        apply_color_id(&mut event, color_id(None).unwrap());
        assert_eq!(event_color(&event), None);
        assert!(event.x_properties.is_empty());
    }

    #[test]
    fn rejects_colors_outside_the_palette() {
        assert!(color_id(Some("#123456")).is_err());
    }
}
