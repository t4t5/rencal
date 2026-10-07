//! The Calendars page's dialogs (ports of `GroupsColumn`'s `GroupModal`,
//! `RenameCalendarModal.tsx`, `ChangeCalendarColorModal.tsx` and
//! `DeleteCalendarDialog`): each keeps its own error and "saving" state and
//! closes once its change went through.

use std::rc::Rc;

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::color_picker::{ColorPicker, ColorPickerEvent, ColorPickerState};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{Disableable, WindowExt, h_flex, v_flex};
use gpui_kit::{
    App, AppContext, Context, Entity, Hsla, IntoElement, ParentElement, Render, Rgba, SharedString,
    Styled, Subscription, Task, Window, div, px, rgb,
};
use rencal_core::error::CoreResult;
use rencal_core::state::AppState;

use crate::backend::Backend;
use crate::editing::dialogs::dialog_title;
use crate::event_store::EventStore;
use crate::theme::ThemeStore;
use crate::ui::{Role, error_text, muted_text, radius_circle};

/// What submitting does: `None` when it's done at once, else the write to
/// wait for.
pub type Submit = Rc<dyn Fn(String, &mut App) -> Option<Task<Result<(), String>>>>;

/// The error to show for a name, if any.
type Validate = Box<dyn Fn(&str) -> Option<String>>;

/// Runs a calendar write on the backend; the calendars reload once it lands.
pub fn calendar_write(
    cx: &mut App,
    write: impl FnOnce(&AppState) -> CoreResult<()> + Send + 'static,
) -> Option<Task<Result<(), String>>> {
    let task = Backend::write(cx, write)?;
    Some(cx.spawn(async move |cx| {
        let result = match task.await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(err)) => Err(err.to_string()),
            Err(err) => Err(err.to_string()),
        };
        if result.is_ok() {
            cx.update(|cx| {
                EventStore::global(cx).update(cx, |store, cx| store.reload_calendars(cx))
            });
        }
        result
    }))
}

/// Opens `view` as a dialog. Enter (the dialog's confirm, which a text
/// input passes on) runs `on_enter` instead of closing the dialog.
fn open_view<V: Render>(
    title: String,
    view: Entity<V>,
    busy: impl Fn(&V) -> bool + 'static,
    on_enter: impl Fn(&mut V, &mut Window, &mut Context<V>) + 'static,
    window: &mut Window,
    cx: &mut App,
) {
    let on_enter = Rc::new(on_enter);
    window.open_dialog(cx, move |dialog, _, cx| {
        let busy = busy(view.read(cx));
        let (enter_view, on_enter) = (view.clone(), on_enter.clone());
        dialog
            .w(px(425.))
            .title(dialog_title(&title, cx))
            .keyboard(!busy)
            .overlay_closable(!busy)
            .on_ok(move |_, window, cx| {
                enter_view.update(cx, |view, cx| on_enter(view, window, cx));
                false
            })
            .child(view.clone())
    });
}

/// Waits for `task`, then closes the dialog or shows the error.
fn settle<V: 'static>(
    task: Task<Result<(), String>>,
    window: &mut Window,
    cx: &mut Context<V>,
    apply: impl FnOnce(&mut V, Option<String>) + 'static,
) {
    cx.spawn_in(window, async move |this, cx| {
        let result = task.await;
        this.update_in(cx, |this, window, cx| {
            let failed = result.err();
            if failed.is_none() {
                window.close_dialog(cx);
            }
            apply(this, failed);
            cx.notify();
        })
        .ok();
    })
    .detach();
}

/// A dialog asking for a name: new / edit group, rename calendar.
pub struct NameDialog {
    input: Entity<InputState>,
    description: &'static str,
    /// The error to show for the current text, if any.
    validate: Validate,
    submit: Submit,
    saving: bool,
    error: Option<String>,
    _subscription: Subscription,
}

pub struct NamePrompt {
    pub title: &'static str,
    pub description: &'static str,
    pub placeholder: &'static str,
    pub initial: String,
}

impl NameDialog {
    pub fn open(
        prompt: NamePrompt,
        validate: impl Fn(&str) -> Option<String> + 'static,
        submit: impl Fn(String, &mut App) -> Option<Task<Result<(), String>>> + 'static,
        window: &mut Window,
        cx: &mut App,
    ) {
        let title = prompt.title.to_owned();
        let view = cx.new(|cx| {
            let input = cx.new(|cx| {
                InputState::new(window, cx)
                    .placeholder(prompt.placeholder)
                    .default_value(prompt.initial.clone())
            });
            let subscription = cx.subscribe(&input, |this: &mut Self, _, event, cx| {
                if let InputEvent::Change = event {
                    this.error = None;
                    cx.notify();
                }
            });
            Self {
                input,
                description: prompt.description,
                validate: Box::new(validate),
                submit: Rc::new(submit),
                saving: false,
                error: None,
                _subscription: subscription,
            }
        });
        open_view(
            title,
            view.clone(),
            |view| view.saving,
            Self::save,
            window,
            cx,
        );
        // After opening: the dialog takes focus when it opens.
        let input = view.read(cx).input.clone();
        input.update(cx, |input, cx| input.focus(window, cx));
    }

    fn name(&self, cx: &App) -> String {
        self.input.read(cx).value().trim().to_owned()
    }

    fn can_save(&self, cx: &App) -> bool {
        let name = self.name(cx);
        !name.is_empty() && (self.validate)(&name).is_none() && !self.saving
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.can_save(cx) {
            return;
        }
        let name = self.name(cx);
        match (self.submit)(name, cx) {
            None => window.close_dialog(cx),
            Some(task) => {
                self.saving = true;
                self.error = None;
                cx.notify();
                settle(task, window, cx, |this, error| {
                    this.saving = false;
                    this.error = error;
                });
            }
        }
    }
}

impl Render for NameDialog {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let name = self.name(cx);
        let invalid = (self.validate)(&name);
        let can_save = self.can_save(cx);
        v_flex()
            .w_full()
            .gap_4()
            .child(muted_text(&theme, "sm", self.description))
            .child(
                v_flex()
                    .gap_2()
                    .child(Input::new(&self.input).disabled(self.saving))
                    .children(invalid.map(|error| error_text(&theme, error)))
                    .children(self.error.clone().map(|error| error_text(&theme, error))),
            )
            .child(
                h_flex()
                    .justify_end()
                    .gap_2()
                    .child(
                        Button::new("name-cancel")
                            .ghost()
                            .disabled(self.saving)
                            .label(Role::Button.text(&theme, "Cancel"))
                            .on_click(|_, window, cx| window.close_dialog(cx)),
                    )
                    .child(
                        Button::new("name-save")
                            .primary()
                            .disabled(!can_save)
                            .label(
                                Role::Button
                                    .text(&theme, if self.saving { "Saving..." } else { "Save" }),
                            )
                            .on_click(cx.listener(|this, _, window, cx| this.save(window, cx))),
                    ),
            )
    }
}

/// `#rrggbb` for a picked colour.
pub fn hex(color: Hsla) -> String {
    let rgba = Rgba::from(color);
    let channel = |value: f32| (value.clamp(0., 1.) * 255.).round() as u8;
    format!(
        "#{:02x}{:02x}{:02x}",
        channel(rgba.r),
        channel(rgba.g),
        channel(rgba.b)
    )
}

/// The calendar colours offered first (the local calendar palette).
pub const FEATURED_COLORS: [u32; 8] = [
    0x7986cb, 0x33b679, 0x8e24aa, 0xe67c73, 0xf6bf26, 0xf4511e, 0x039be5, 0x0b8043,
];

pub struct ColorDialog {
    slug: String,
    name: String,
    picker: Entity<ColorPickerState>,
    color: Hsla,
    saving: bool,
    error: Option<String>,
    _subscription: Subscription,
}

impl ColorDialog {
    pub fn open(slug: String, name: String, current: Hsla, window: &mut Window, cx: &mut App) {
        let view = cx.new(|cx| {
            let picker = cx.new(|cx| ColorPickerState::new(window, cx).default_value(current));
            let subscription = cx.subscribe(&picker, |this: &mut Self, _, event, cx| {
                let ColorPickerEvent::Change(Some(color)) = event else {
                    return;
                };
                this.color = *color;
                cx.notify();
            });
            Self {
                slug,
                name,
                picker,
                color: current,
                saving: false,
                error: None,
                _subscription: subscription,
            }
        });
        open_view(
            "Change calendar color".into(),
            view,
            |view| view.saving,
            Self::save,
            window,
            cx,
        );
    }

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.saving {
            return;
        }
        let (slug, color) = (self.slug.clone(), hex(self.color));
        let Some(task) = calendar_write(cx, move |state| {
            rencal_core::caldir::set_calendar_color(state, slug, color)
        }) else {
            return;
        };
        self.saving = true;
        self.error = None;
        cx.notify();
        settle(task, window, cx, |this, error| {
            this.saving = false;
            this.error = error;
        });
    }
}

impl Render for ColorDialog {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        v_flex()
            .w_full()
            .gap_6()
            .child(muted_text(
                &theme,
                "sm",
                format!("Choose a color for {}.", self.name),
            ))
            .child(
                h_flex()
                    .gap_4()
                    .child(
                        div()
                            .size(px(32.))
                            .flex_none()
                            .rounded(radius_circle(&theme))
                            .bg(self.color),
                    )
                    .child(
                        ColorPicker::new(&self.picker)
                            .featured_colors(
                                FEATURED_COLORS.iter().map(|c| rgb(*c).into()).collect(),
                            )
                            .label(SharedString::from(hex(self.color))),
                    ),
            )
            .children(self.error.clone().map(|error| error_text(&theme, error)))
            .child(
                h_flex()
                    .justify_end()
                    .gap_2()
                    .child(
                        Button::new("color-cancel")
                            .secondary()
                            .disabled(self.saving)
                            .label(Role::Button.text(&theme, "Cancel"))
                            .on_click(|_, window, cx| window.close_dialog(cx)),
                    )
                    .child(
                        Button::new("color-save")
                            .primary()
                            .disabled(self.saving)
                            .label(Role::Button.text(
                                &theme,
                                if self.saving {
                                    "Saving..."
                                } else {
                                    "Save color"
                                },
                            ))
                            .on_click(cx.listener(|this, _, window, cx| this.save(window, cx))),
                    ),
            )
    }
}

pub struct DeleteCalendarDialog {
    slug: String,
    name: String,
    /// Local calendars are deleted; connected ones disconnected.
    local: bool,
    deleting: bool,
    error: Option<String>,
}

impl DeleteCalendarDialog {
    pub fn open(slug: String, name: String, local: bool, window: &mut Window, cx: &mut App) {
        let title = if local {
            "Delete calendar"
        } else {
            "Disconnect calendar"
        };
        let view = cx.new(|_| Self {
            slug,
            name,
            local,
            deleting: false,
            error: None,
        });
        open_view(
            title.into(),
            view,
            |view| view.deleting,
            |_, _, _| {},
            window,
            cx,
        );
    }

    fn delete(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.deleting {
            return;
        }
        let slug = self.slug.clone();
        let Some(task) = calendar_write(cx, move |state| {
            rencal_core::caldir::delete_calendar(state, slug)
        }) else {
            return;
        };
        self.deleting = true;
        self.error = None;
        cx.notify();
        settle(task, window, cx, |this, error| {
            this.deleting = false;
            this.error = error;
        });
    }
}

impl Render for DeleteCalendarDialog {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let text = if self.local {
            format!(
                "Are you sure you want to delete \"{}\"? All events will be permanently deleted.",
                self.name
            )
        } else {
            format!(
                "Disconnect \"{}\"? This will delete the directory from this computer.",
                self.name
            )
        };
        let label = match (self.local, self.deleting) {
            (true, false) => "Delete calendar",
            (true, true) => "Deleting...",
            (false, false) => "Disconnect calendar",
            (false, true) => "Disconnecting...",
        };
        v_flex()
            .w_full()
            .gap_4()
            .child(muted_text(&theme, "sm", text))
            .children(self.error.clone().map(|error| error_text(&theme, error)))
            .child(
                h_flex()
                    .justify_end()
                    .gap_2()
                    .child(
                        Button::new("delete-calendar-cancel")
                            .secondary()
                            .disabled(self.deleting)
                            .label(Role::Button.text(&theme, "Cancel"))
                            .on_click(|_, window, cx| window.close_dialog(cx)),
                    )
                    .child(
                        Button::new("delete-calendar-confirm")
                            .danger()
                            .disabled(self.deleting)
                            .label(Role::Button.text(&theme, label))
                            .on_click(cx.listener(|this, _, window, cx| this.delete(window, cx))),
                    ),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trips_palette_colours() {
        for color in FEATURED_COLORS {
            assert_eq!(hex(rgb(color).into()), format!("#{color:06x}"));
        }
    }
}
