//! The mass-delete confirmation (port of `MassDeleteConfirmDialog.tsx`):
//! when a sync held back calendars whose push would delete many events
//! (`SyncState::pending_mass_delete`), the main window asks whether to delete
//! them, restore them, or leave them for later.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::dialog::DialogFooter;
use gpui_kit::component::{WindowExt, h_flex, v_flex};
use gpui_kit::{App, IntoElement, ParentElement, SharedString, Styled, Window, div, px};

use crate::editing::dialogs::{description, dialog_title};
use crate::event_store::EventStore;
use crate::sync_state::{PendingSync, SyncState};
use crate::theme::ActiveRenTheme;
use crate::ui::{Role, color, radius, text_size};

/// Opens the dialog while a sync's tripped calendars wait for an answer.
/// The main window calls this as it renders; it does nothing while a dialog
/// (this one or another) is showing.
pub fn show_if_pending(window: &mut Window, cx: &mut App) {
    let Some(pending) = SyncState::global(cx).pending_mass_delete.clone() else {
        return;
    };
    if window.has_active_dialog(cx) {
        return;
    }
    let total: u32 = pending.iter().map(|p| p.to_push_delete).sum();
    let text = summary(total, pending.len());
    window.open_dialog(cx, move |dialog, _, cx| {
        let theme = cx.ren_theme();
        let store = EventStore::global(cx).read(cx);
        let rows = pending
            .iter()
            .map(|p| row(p, store.calendar_name(&p.calendar_slug), cx));
        let button =
            |id: &'static str, label: &str| Button::new(id).label(Role::Button.text(theme, label));
        dialog
            .w(px(512.))
            .title(dialog_title("Confirm large deletion", cx))
            .child(description(text.clone().into(), None, cx))
            .child(
                v_flex()
                    .gap_1()
                    .text_size(text_size(theme, "sm"))
                    .children(rows),
            )
            .footer(
                DialogFooter::new()
                    .child(button("mass-delete-cancel", "Cancel").secondary().on_click(
                        |_, window, cx| {
                            window.close_dialog(cx);
                        },
                    ))
                    .child(
                        button("mass-delete-restore", "Restore events")
                            .secondary()
                            .on_click(|_, window, cx| {
                                SyncState::discard_mass_delete(cx);
                                window.close_dialog(cx);
                            }),
                    )
                    .child(
                        button("mass-delete-confirm", &delete_label(total))
                            .danger()
                            .on_click(|_, window, cx| {
                                SyncState::confirm_mass_delete(cx);
                                window.close_dialog(cx);
                            }),
                    ),
            )
            // Escape, the overlay and Cancel leave the deletions pending.
            .on_close(|_, _, cx| {
                if SyncState::global(cx).pending_mass_delete.is_some() {
                    SyncState::cancel_mass_delete(cx);
                }
            })
    });
}

fn plural(count: u32, noun: &str) -> String {
    format!("{count} {noun}{}", if count == 1 { "" } else { "s" })
}

fn summary(total: u32, calendars: usize) -> String {
    format!(
        "Syncing would delete {} from {}. Continue?",
        plural(total, "event"),
        plural(calendars as u32, "calendar")
    )
}

fn delete_label(total: u32) -> String {
    format!("Delete {}", plural(total, "event"))
}

fn row(pending: &PendingSync, name: String, cx: &App) -> impl IntoElement + use<> {
    let theme = cx.ren_theme();
    h_flex()
        .justify_between()
        .gap_4()
        .p_2()
        .border_1()
        .border_color(color(theme, "border"))
        .rounded(radius(theme, 0.4))
        .child(div().min_w_0().truncate().child(SharedString::from(name)))
        .child(
            div()
                .text_color(color(theme, "text.muted"))
                .child(pending.to_push_delete.to_string()),
        )
}

#[cfg(test)]
mod tests {
    use gpui_kit::{TestAppContext, VisualTestContext};
    use rencal_config::ThemeConfig;

    use super::*;
    use crate::windows::main_window;
    use crate::{actions, test_support};

    fn tripped() -> Vec<PendingSync> {
        vec![PendingSync {
            calendar_slug: "work".into(),
            to_push: 0,
            to_push_delete: 12,
            to_pull: 0,
        }]
    }

    #[gpui_kit::test]
    fn a_tripped_sync_asks_and_cancel_leaves_it_for_later(cx: &mut TestAppContext) {
        let handle = cx.update(|cx| {
            test_support::init(ThemeConfig::default(), None, cx);
            actions::init(cx);
            main_window::open(cx).unwrap();
            main_window::handle(cx).unwrap()
        });
        let cx = VisualTestContext::from_window(handle, cx).into_mut();
        cx.update(|_, cx| SyncState::set_pending_mass_delete(tripped(), cx));
        cx.run_until_parked();
        assert!(cx.update(|window, cx| window.has_active_dialog(cx)));
        assert!(cx.update(|_, cx| SyncState::global(cx).is_locked()));

        // Escape is "Cancel": the deletions stay pending, syncs run again.
        cx.simulate_keystrokes("escape");
        cx.run_until_parked();
        assert!(!cx.update(|window, cx| window.has_active_dialog(cx)));
        let state = cx.update(|_, cx| SyncState::global(cx).clone());
        assert!(state.pending_mass_delete.is_none());
        assert!(!state.is_locked());
    }

    #[test]
    fn texts_pluralise_like_the_old_dialog() {
        assert_eq!(
            summary(12, 1),
            "Syncing would delete 12 events from 1 calendar. Continue?"
        );
        assert_eq!(delete_label(1), "Delete 1 event");
    }
}
