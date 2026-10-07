//! The participants field (port of `AttendeesDisplay.tsx`): the organiser
//! and attendees with their RSVP dots, and an input that adds an email on
//! Enter, `,`, Tab or blur, suggesting known contacts as you type (Up/Down
//! to pick, Escape to dismiss the suggestions).

use gpui_kit::component::input::IndentInline;
use gpui_kit::component::{Icon, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, AppContext, Context, Entity, EventEmitter, Hsla, InteractiveElement, IntoElement,
    ParentElement, SharedString, StatefulInteractiveElement, Styled, Subscription, Window, div, px,
};
use rencal_text::contacts::{
    Contact, DEFAULT_SUGGESTION_LIMIT, is_valid_contact_email, suggest_contacts,
};
use rencal_theme::ResolvedTheme;
use rencal_time::event::{EventAttendee, ResponseStatus};

use super::{ComboEvent, ComboOption, ComboState, Controls, combo, remove_button};
use crate::assets::RenIcon;
use crate::backend::{self, Backend};
use crate::ui::color;

fn attendee_key(email: &str) -> String {
    email.trim().to_lowercase()
}

#[derive(Clone, Debug, PartialEq)]
pub struct AttendeesChanged(pub Vec<EventAttendee>);

pub struct AttendeesField {
    combo: Entity<ComboState>,
    contacts: Vec<Contact>,
    /// The attendees as last rendered (to add to / remove from).
    attendees: Vec<EventAttendee>,
    organizer: Option<EventAttendee>,
    invalid: bool,
    dismissed: bool,
    _subscriptions: Vec<Subscription>,
}

impl EventEmitter<AttendeesChanged> for AttendeesField {}

impl AttendeesField {
    pub fn new(editable: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let combo = cx.new(|cx| {
            let mut combo = ComboState::new(false, window, cx);
            combo.set_placeholder("Add participant", window, cx);
            combo
        });
        let subscriptions = vec![cx.subscribe_in(&combo, window, Self::on_combo)];
        if editable && let Some(load) = Backend::read(cx, backend::list_contacts) {
            cx.spawn(async move |this, cx| {
                if let Ok(Ok(contacts)) = load.await {
                    this.update(cx, |this, cx| {
                        this.contacts = contacts;
                        cx.notify();
                    })
                    .ok();
                }
            })
            .detach();
        }
        Self {
            combo,
            contacts: Vec::new(),
            attendees: Vec::new(),
            organizer: None,
            invalid: false,
            dismissed: false,
            _subscriptions: subscriptions,
        }
    }

    pub fn set_value(&mut self, attendees: &[EventAttendee], organizer: Option<&EventAttendee>) {
        self.attendees = attendees.to_vec();
        self.organizer = organizer.cloned();
    }

    fn suggestions(&self, query: &str) -> Vec<Contact> {
        let exclude = self
            .attendees
            .iter()
            .map(|a| a.email.clone())
            .chain(self.organizer.iter().map(|o| o.email.clone()));
        suggest_contacts(&self.contacts, query, exclude, DEFAULT_SUGGESTION_LIMIT)
            .into_iter()
            .cloned()
            .collect()
    }

    fn reset_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.invalid = false;
        self.dismissed = false;
        self.combo.update(cx, |combo, cx| {
            combo.set_text("", window, cx);
            combo.set_open(false, cx);
            combo.set_highlighted(None, cx);
        });
    }

    /// Adds the typed email (`addAttendee`).
    fn add_typed(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let email = attendee_key(&self.combo.read(cx).text(cx));
        if email.is_empty() {
            self.invalid = false;
            return;
        }
        if !is_valid_contact_email(&email) {
            self.invalid = true;
            cx.notify();
            return;
        }
        let exists = self
            .attendees
            .iter()
            .any(|a| attendee_key(&a.email) == email);
        let is_organizer = self
            .organizer
            .as_ref()
            .is_some_and(|o| attendee_key(&o.email) == email);
        if !exists && !is_organizer {
            let mut attendees = self.attendees.clone();
            attendees.push(EventAttendee {
                name: None,
                email,
                response_status: Some(ResponseStatus::NeedsAction),
            });
            cx.emit(AttendeesChanged(attendees));
        }
        self.reset_input(window, cx);
    }

    fn add_contact(&mut self, email: &str, window: &mut Window, cx: &mut Context<Self>) {
        let Some(contact) = self.contacts.iter().find(|c| c.email == email).cloned() else {
            return;
        };
        if !is_valid_contact_email(&contact.email) {
            return;
        }
        let mut attendees = self.attendees.clone();
        attendees.push(EventAttendee {
            name: contact.name,
            email: contact.email,
            response_status: Some(ResponseStatus::NeedsAction),
        });
        cx.emit(AttendeesChanged(attendees));
        self.reset_input(window, cx);
    }

    fn remove(&mut self, email: &str, cx: &mut Context<Self>) {
        let key = attendee_key(email);
        let attendees = self
            .attendees
            .iter()
            .filter(|a| attendee_key(&a.email) != key)
            .cloned()
            .collect();
        cx.emit(AttendeesChanged(attendees));
    }

    fn on_combo(
        &mut self,
        _: &Entity<ComboState>,
        event: &ComboEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        match event {
            ComboEvent::Query(text) => {
                if let Some(text) = text.strip_suffix(',') {
                    let text = text.to_owned();
                    self.combo
                        .update(cx, |combo, cx| combo.set_text(&text, window, cx));
                    if !text.trim().is_empty() {
                        self.add_typed(window, cx);
                    }
                    return;
                }
                self.invalid = false;
                self.dismissed = false;
                let suggestions = self.suggestions(text);
                let first = suggestions
                    .first()
                    .map(|c| SharedString::from(c.email.clone()));
                let show = !text.trim().is_empty() && !suggestions.is_empty();
                self.combo.update(cx, |combo, cx| {
                    combo.set_open(show, cx);
                    combo.set_highlighted(first, cx);
                });
            }
            ComboEvent::Commit { key, .. } => self.add_contact(key, window, cx),
            ComboEvent::Submit => self.add_typed(window, cx),
            ComboEvent::Blur => {
                if !self.combo.read(cx).text(cx).trim().is_empty() {
                    self.add_typed(window, cx);
                }
            }
            ComboEvent::Closed => self.dismissed = true,
            ComboEvent::Opened => {}
        }
        cx.notify();
    }

    pub fn render_field(
        &self,
        theme: &ResolvedTheme,
        controls: Controls,
        editable: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> impl IntoElement + use<> {
        let organizer_key = self.organizer.as_ref().map(|o| attendee_key(&o.email));
        let organizer_row = organizer_key.as_ref().and_then(|key| {
            self.attendees
                .iter()
                .find(|a| &attendee_key(&a.email) == key)
                .map(|a| attendee_row(a, Some("Organiser"), None::<fn(&mut App)>, theme, controls))
        });
        let this = cx.entity().downgrade();
        let rows = self
            .attendees
            .iter()
            .filter(|a| Some(attendee_key(&a.email)) != organizer_key)
            .map(|attendee| {
                let email = attendee.email.clone();
                let this = this.clone();
                attendee_row(
                    attendee,
                    None,
                    editable.then_some(move |cx: &mut App| {
                        this.update(cx, |this, cx| this.remove(&email, cx)).ok();
                    }),
                    theme,
                    controls,
                )
            })
            .collect::<Vec<_>>();
        let query = self.combo.read(cx).text(cx);
        let options = if self.dismissed {
            Vec::new()
        } else {
            self.suggestions(&query)
                .into_iter()
                .map(|contact| ComboOption {
                    key: contact.email.clone().into(),
                    label: v_flex()
                        .min_w_0()
                        .child(
                            div().truncate().child(
                                contact
                                    .name
                                    .clone()
                                    .unwrap_or_else(|| contact.email.clone()),
                            ),
                        )
                        .when(contact.name.is_some(), |this| {
                            this.child(
                                div()
                                    .truncate()
                                    .text_size(controls.text_xs)
                                    .text_color(controls.muted)
                                    .child(contact.email.clone()),
                            )
                        })
                        .into_any_element(),
                    current: false,
                })
                .collect()
        };
        let has_attendees = !self.attendees.is_empty();
        let invalid = self.invalid;
        let error = color(theme, "error");
        v_flex()
            .children(organizer_row)
            .children(rows)
            .when(editable, |this| {
                this.child(
                    div()
                        .when(has_attendees, |this| this.mt_1())
                        .when(invalid, |this| {
                            this.border_1().border_color(error).rounded(controls.radius)
                        })
                        .capture_action({
                            let this = cx.entity().downgrade();
                            move |_: &IndentInline, window, cx| {
                                this.update(cx, |this, cx| {
                                    if this.combo.read(cx).text(cx).trim().is_empty() {
                                        cx.propagate();
                                    } else {
                                        this.add_typed(window, cx);
                                    }
                                })
                                .ok();
                            }
                        })
                        .child(combo(
                            "attendees",
                            &self.combo,
                            controls,
                            Some(controls.leading((!has_attendees).then_some(RenIcon::User))),
                            None,
                            options,
                            "",
                            px(200.),
                            false,
                            window,
                            cx,
                        )),
                )
            })
    }
}

/// The RSVP dot (`StatusDot`).
pub fn status_dot(status: Option<ResponseStatus>, theme: &ResolvedTheme) -> impl IntoElement {
    let (fill, icon): (Hsla, Option<RenIcon>) = match status {
        Some(ResponseStatus::Accepted) => (color(theme, "success"), Some(RenIcon::Check)),
        Some(ResponseStatus::Declined) => (color(theme, "error"), Some(RenIcon::Close)),
        Some(ResponseStatus::Tentative) => (color(theme, "warning"), Some(RenIcon::QuestionMark)),
        _ => (color(theme, "text.muted"), None),
    };
    div()
        .size_4()
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(crate::ui::radius_circle(theme))
        .bg(fill)
        .children(icon.map(|icon| {
            Icon::new(icon)
                .size_3()
                .text_color(color(theme, "background"))
        }))
}

fn attendee_row<R: Fn(&mut App) + 'static>(
    attendee: &EventAttendee,
    label: Option<&'static str>,
    on_remove: Option<R>,
    theme: &ResolvedTheme,
    controls: Controls,
) -> impl IntoElement + use<R> {
    let name = attendee
        .name
        .clone()
        .unwrap_or_else(|| attendee.email.clone());
    let tooltip = attendee
        .name
        .as_ref()
        .filter(|name| **name != attendee.email)
        .map(|_| attendee.email.clone());
    let group = SharedString::from(format!("attendee:{}", attendee.email));
    h_flex()
        .id(SharedString::from(format!(
            "attendee-row:{}",
            attendee.email
        )))
        .group(group.clone())
        .min_h(controls.height)
        .items_center()
        .gap(controls.gap)
        .px(controls.padding_x)
        .py_1()
        .text_size(controls.text_sm)
        .when_some(tooltip, |this, tooltip| {
            this.tooltip(move |window, cx| {
                gpui_kit::component::tooltip::Tooltip::new(tooltip.clone()).build(window, cx)
            })
        })
        .child(
            div()
                .w(controls.leading)
                .flex()
                .justify_center()
                .child(status_dot(attendee.response_status, theme)),
        )
        .child(
            h_flex()
                .flex_1()
                .min_w_0()
                .gap_2()
                .child(div().truncate().child(name))
                .when_some(label, |this, label| {
                    this.child(
                        div()
                            .flex_shrink_0()
                            .text_color(controls.muted)
                            .child(label),
                    )
                }),
        )
        .when_some(on_remove, |this, on_remove| {
            this.child(
                div()
                    .invisible()
                    .group_hover(group, |style| style.visible())
                    .child(remove_button(
                        SharedString::from(format!("remove-attendee:{}", attendee.email)),
                        controls,
                        move |_, _, cx| on_remove(cx),
                    )),
            )
        })
}
