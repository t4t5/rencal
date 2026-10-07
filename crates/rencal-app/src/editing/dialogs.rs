//! The confirmation dialogs of event commands (ports of
//! `RecurrenceConfirmDialog.tsx` and `DeleteConfirmDialog.tsx`): which
//! occurrences of a series an edit, duplicate or delete applies to, and the
//! plain delete confirmation. The choice is handed to a callback after the
//! dialog closes.

use std::rc::Rc;

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::dialog::DialogFooter;
use gpui_kit::component::{WindowExt, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    App, FontWeight, Global, HighlightStyle, IntoElement, ParentElement, SharedString, Styled,
    StyledText, Window, div, px,
};

use crate::theme::ActiveRenTheme;
use crate::ui::{Role, color, text_size};

/// Which occurrences of a recurring event a command applies to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
    This,
    Future,
    All,
}

pub type OnScope = Rc<dyn Fn(Scope, &mut Window, &mut App)>;

/// The "Only this event / This and future events / All events" dialog.
pub struct ScopePrompt {
    pub title: &'static str,
    pub description: &'static str,
    /// Only the organizer can split a series.
    pub can_apply_to_future: bool,
}

impl ScopePrompt {
    pub const EDIT: Self = Self {
        title: "Edit recurring event",
        description: "This event is part of a recurring series.",
        can_apply_to_future: true,
    };

    pub const DUPLICATE: Self = Self {
        title: "Duplicate recurring event",
        description: "This event is part of a recurring series. Which events do you want to duplicate?",
        can_apply_to_future: true,
    };
}

fn choice_button(
    id: &'static str,
    label: &'static str,
    scope: Scope,
    on_choice: &OnScope,
    cx: &App,
) -> Button {
    let on_choice = on_choice.clone();
    Button::new(id)
        .label(Role::Button.text(cx.ren_theme(), label))
        .on_click(move |_, window, cx| {
            window.close_dialog(cx);
            on_choice(scope, window, cx);
        })
}

pub fn choose_scope(
    prompt: ScopePrompt,
    on_choice: impl Fn(Scope, &mut Window, &mut App) + 'static,
    window: &mut Window,
    cx: &mut App,
) {
    let on_choice: OnScope = Rc::new(on_choice);
    window.open_dialog(cx, move |dialog, _, cx| {
        let footer = DialogFooter::new()
            .child(
                choice_button("scope-this", "Only this event", Scope::This, &on_choice, cx)
                    .secondary(),
            )
            .children(prompt.can_apply_to_future.then(|| {
                choice_button(
                    "scope-future",
                    "This and future events",
                    Scope::Future,
                    &on_choice,
                    cx,
                )
                .secondary()
            }))
            .child(choice_button("scope-all", "All events", Scope::All, &on_choice, cx).primary());
        dialog
            .w(px(576.))
            .title(dialog_title(prompt.title, cx))
            .child(description(prompt.description.into(), None, cx))
            .footer(footer)
    });
}

/// Set while a delete confirmation is open: a second delete must not
/// retarget it.
struct DeletePending;

impl Global for DeletePending {}

/// The delete confirmation. A recurring event asks which occurrences; any
/// other gets a plain "Delete".
pub fn confirm_delete(
    summary: &str,
    recurring: bool,
    on_choice: impl Fn(Scope, &mut Window, &mut App) + 'static,
    window: &mut Window,
    cx: &mut App,
) {
    if cx.has_global::<DeletePending>() && window.has_active_dialog(cx) {
        return;
    }
    cx.set_global(DeletePending);
    let on_choice: OnScope = Rc::new(on_choice);
    let name = (!summary.is_empty()).then(|| format!("“{summary}”"));
    let (title, text, highlight) = delete_text(name.as_deref(), recurring);
    window.open_dialog(cx, move |dialog, _, cx| {
        let footer = if recurring {
            DialogFooter::new()
                .child(
                    choice_button(
                        "delete-this",
                        "Only this event",
                        Scope::This,
                        &on_choice,
                        cx,
                    )
                    .secondary(),
                )
                .child(
                    choice_button(
                        "delete-future",
                        "This and future events",
                        Scope::Future,
                        &on_choice,
                        cx,
                    )
                    .danger(),
                )
                .child(
                    choice_button("delete-all", "All events", Scope::All, &on_choice, cx).danger(),
                )
        } else {
            DialogFooter::new().child(
                choice_button("delete-confirm", "Delete", Scope::This, &on_choice, cx).danger(),
            )
        };
        dialog
            .w(px(if recurring { 576. } else { 512. }))
            .title(dialog_title(title, cx))
            .child(description(text.clone().into(), highlight.clone(), cx))
            .footer(footer)
            .on_close(|_, _, cx| {
                cx.remove_global::<DeletePending>();
            })
    });
}

/// The delete dialog's title, text and the byte range of the event's name.
fn delete_text(
    name: Option<&str>,
    recurring: bool,
) -> (&'static str, String, Option<std::ops::Range<usize>>) {
    let (title, before, after, fallback) = if recurring {
        (
            "Delete recurring event",
            "The event ",
            " is part of a recurring series. Which events do you want to delete?",
            "This event is part of a recurring series. Which events do you want to delete?",
        )
    } else {
        (
            "Delete event",
            "Are you sure you want to delete the event ",
            "?",
            "Are you sure you want to delete this event?",
        )
    };
    match name {
        Some(name) => (
            title,
            format!("{before}{name}{after}"),
            Some(before.len()..before.len() + name.len()),
        ),
        None => (title, fallback.to_owned(), None),
    }
}

fn dialog_title(title: &str, cx: &App) -> impl IntoElement + use<> {
    let theme = cx.ren_theme();
    div()
        .font_family(Role::Heading.family(cx))
        .when_some(Role::Heading.weight(theme), |this, weight| {
            this.font_weight(weight)
        })
        .child(Role::Heading.text(theme, title))
}

fn description(
    text: SharedString,
    highlight: Option<std::ops::Range<usize>>,
    cx: &App,
) -> impl IntoElement + use<> {
    let theme = cx.ren_theme();
    let styled = StyledText::new(text).with_highlights(highlight.map(|range| {
        (
            range,
            HighlightStyle {
                font_weight: Some(FontWeight::MEDIUM),
                color: Some(color(theme, "text")),
                ..Default::default()
            },
        )
    }));
    v_flex()
        .text_size(text_size(theme, "sm"))
        .text_color(color(theme, "text.muted"))
        .child(styled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_text_highlights_the_name() {
        let (title, text, range) = delete_text(Some("“Standup”"), false);
        assert_eq!(title, "Delete event");
        assert_eq!(text, "Are you sure you want to delete the event “Standup”?");
        assert_eq!(&text[range.unwrap()], "“Standup”");
        let (title, text, range) = delete_text(None, true);
        assert_eq!(title, "Delete recurring event");
        assert!(text.starts_with("This event is part of a recurring series."));
        assert!(range.is_none());
    }
}
