//! The command palette (port of `components/shortcuts/CommandPalette.tsx`):
//! a gpui-kit `Command` in a dialog. The root page lists `PALETTE_COMMANDS`;
//! some drill into a page of their own (go to date, theme, calendar group).
//! `Escape` or `Backspace` on an empty query step back to the root before
//! `Escape` closes it.
//!
//! A chosen command runs after the dialog closes, from the main window, so
//! window-level actions (search, the shortcuts overlay) reach their handlers
//! and focus is back where it was.

use chrono::Utc;
use gpui_kit::component::command::{Command, CommandGroup, CommandItem, CommandState};
use gpui_kit::component::input::Backspace;
use gpui_kit::component::{Icon, IndexPath, WindowExt, h_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    Action, App, AppContext, Context, Entity, FocusHandle, Focusable, InteractiveElement,
    IntoElement, ParentElement, Render, SharedString, Styled, Subscription, Window, div, px,
};
use rencal_text::calendar_groups::{format_group_name, group_options};
use rencal_text::magic::parse_event_text;
use rencal_time::NaiveDate;
use rencal_time::display::format_long_date;

use crate::assets::RenIcon;
use crate::clock::Clock;
use crate::commands::{self, CommandGroup as Group, PALETTE_COMMANDS, Submenu};
use crate::keymap;
use crate::navigation::Navigation;
use crate::settings::Settings;
use crate::theme::{ActiveRenTheme, ThemeStore};
use crate::ui::{color, kbd::kbd_group, text_size};
use crate::ui_state::UiState;

pub use commands::Page as PalettePage;

/// Which page the palette shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Page {
    Root,
    GoToDate,
    Submenu(Submenu),
}

impl From<PalettePage> for Page {
    fn from(page: PalettePage) -> Self {
        match page {
            PalettePage::GoToDate => Page::GoToDate,
        }
    }
}

/// What confirming a row does.
enum Entry {
    Run(Box<dyn Action>),
    Drill(Page),
    GoTo(NaiveDate),
    Pick(Submenu, String),
}

impl Clone for Entry {
    fn clone(&self) -> Self {
        match self {
            Self::Run(action) => Self::Run(action.boxed_clone()),
            Self::Drill(page) => Self::Drill(*page),
            Self::GoTo(date) => Self::GoTo(*date),
            Self::Pick(submenu, id) => Self::Pick(*submenu, id.clone()),
        }
    }
}

struct PaletteOpen;

impl gpui_kit::Global for PaletteOpen {}

/// Opens the palette on `page` (closing it when it's open on the root page).
pub fn toggle(page: Page, window: &mut Window, cx: &mut App) {
    if cx.has_global::<PaletteOpen>() && window.has_active_dialog(cx) {
        window.close_dialog(cx);
        cx.remove_global::<PaletteOpen>();
        return;
    }
    open(page, window, cx);
}

pub fn open(page: Page, window: &mut Window, cx: &mut App) {
    if cx.has_global::<PaletteOpen>() && window.has_active_dialog(cx) {
        window.close_dialog(cx);
    }
    let restore = window.focused(cx);
    let palette = cx.new(|cx| CommandPalette::new(page, restore, window, cx));
    cx.set_global(PaletteOpen);
    let content = palette.clone();
    window.open_dialog(cx, move |dialog, _, _| {
        dialog
            .w(px(576.))
            .close_button(false)
            .keyboard(false)
            .p_0()
            .on_close(|_, _, cx| {
                cx.remove_global::<PaletteOpen>();
            })
            .child(content.clone())
    });
    let focus = palette.read(cx).state.clone();
    focus.update(cx, |state, cx| state.focus(window, cx));
}

pub struct CommandPalette {
    state: Entity<CommandState>,
    page: Page,
    query: String,
    entries: Vec<Entry>,
    /// Where focus returns when the palette closes.
    restore: Option<FocusHandle>,
    _subscriptions: Vec<Subscription>,
}

impl CommandPalette {
    fn new(
        page: Page,
        restore: Option<FocusHandle>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let state = cx.new(|cx| CommandState::new(window, cx));
        Self {
            state,
            page,
            query: String::new(),
            entries: Vec::new(),
            restore,
            _subscriptions: vec![cx.observe_global::<ThemeStore>(|_, cx| cx.notify())],
        }
    }

    fn go_to(&mut self, page: Page, window: &mut Window, cx: &mut Context<Self>) {
        self.page = page;
        self.query.clear();
        self.state
            .update(cx, |state, cx| state.set_query("", window, cx));
        cx.notify();
    }

    fn close(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        cx.remove_global::<PaletteOpen>();
        window.close_dialog(cx);
        if let Some(focus) = self.restore.clone() {
            window.focus(&focus, cx);
        }
    }

    fn confirm(&mut self, index: usize, window: &mut Window, cx: &mut Context<Self>) {
        let Some(entry) = self.entries.get(index).cloned() else {
            return;
        };
        match entry {
            Entry::Drill(page) => self.go_to(page, window, cx),
            Entry::Run(action) => {
                self.close(window, cx);
                window.defer(cx, move |window, cx| window.dispatch_action(action, cx));
            }
            Entry::GoTo(date) => {
                self.close(window, cx);
                Navigation::navigate_to(date, None, cx);
            }
            Entry::Pick(Submenu::Themes, id) => {
                self.close(window, cx);
                ThemeStore::pick(&id, cx);
            }
            Entry::Pick(Submenu::CalendarGroups, name) => {
                self.close(window, cx);
                UiState::update(cx, |ui| ui.active_group = name);
            }
        }
    }

    /// `Escape` on an empty query: back to the root, or close from there.
    fn cancel(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.page == Page::Root {
            let palette = cx.entity().downgrade();
            window.defer(cx, move |window, cx| {
                palette
                    .update(cx, |palette, cx| palette.close(window, cx))
                    .ok();
            });
        } else {
            self.go_to(Page::Root, window, cx);
        }
    }

    /// `Backspace` on an empty query steps back out of a page (captured
    /// before the input handles it).
    fn on_backspace(&mut self, _: &Backspace, window: &mut Window, cx: &mut Context<Self>) {
        if self.page != Page::Root && self.query.is_empty() {
            cx.stop_propagation();
            self.go_to(Page::Root, window, cx);
        }
    }

    /// The rows of the current page and what each does, flattened in display
    /// order (the `IndexPath` rows the command reports map onto this list).
    fn build(&mut self, cx: &App) -> (Vec<(CommandGroup, usize)>, &'static str) {
        self.entries.clear();
        match self.page {
            Page::Root => {
                let has_groups = group_options(&Settings::global(cx).rencal.groups).len() >= 2;
                let mut groups = Vec::new();
                for group in Group::ALL {
                    let mut items = Vec::new();
                    for command in PALETTE_COMMANDS.iter().filter(|c| c.group == group) {
                        if command.submenu == Some(Submenu::CalendarGroups) && !has_groups {
                            continue;
                        }
                        let label = command.label();
                        let drill = command
                            .submenu
                            .map(Page::Submenu)
                            .or(command.page.map(Page::from));
                        let binding = keymap::shortcut(command.id)
                            .and_then(|s| s.display_binding())
                            .map(|b| b.keys);
                        self.entries.push(match (drill, command.action()) {
                            (Some(page), _) => Entry::Drill(page),
                            (None, Some(action)) => Entry::Run(action),
                            (None, None) => continue,
                        });
                        items.push(row(label, drill.is_some(), binding, false, group.label()));
                    }
                    let len = items.len();
                    groups.push((CommandGroup::new().label(group.label()).items(items), len));
                }
                (groups, "Type a command…")
            }
            Page::GoToDate => {
                let clock = Clock::global(cx);
                let mut items = Vec::new();
                if !self.query.trim().is_empty() {
                    let now = Utc::now().with_timezone(&clock.viewer).naive_local();
                    let parsed = parse_event_text(&self.query, now, clock.viewer);
                    if let Some(time) = parsed.time {
                        let date = time.start.date_in_viewer_zone(clock.viewer);
                        self.entries.push(Entry::GoTo(date));
                        items.push(
                            CommandItem::new()
                                .label(SharedString::from(self.query.clone()))
                                .child({
                                    let label = format_long_date(date, clock.today);
                                    move |_, _| div().child(label.clone())
                                }),
                        );
                    }
                }
                let len = items.len();
                (
                    vec![(CommandGroup::new().label("Go to date").items(items), len)],
                    "Type a date…",
                )
            }
            Page::Submenu(submenu) => {
                let (heading, placeholder, items, active): (_, _, Vec<(String, String)>, String) =
                    match submenu {
                        Submenu::Themes => {
                            let store = ThemeStore::global(cx);
                            (
                                "Theme",
                                "Search themes…",
                                store
                                    .descriptors()
                                    .into_iter()
                                    .map(|d| (d.id, d.name))
                                    .collect(),
                                store.active_id().to_owned(),
                            )
                        }
                        Submenu::CalendarGroups => (
                            "Group",
                            "Search groups…",
                            group_options(&Settings::global(cx).rencal.groups)
                                .into_iter()
                                .map(|name| {
                                    let label = format_group_name(&name);
                                    (name, label)
                                })
                                .collect(),
                            UiState::global(cx).active_group.clone(),
                        ),
                    };
                let rows = items
                    .into_iter()
                    .map(|(id, label)| {
                        let checked = id == active;
                        self.entries.push(Entry::Pick(submenu, id));
                        row(&label, false, None, checked, heading)
                    })
                    .collect::<Vec<_>>();
                let len = rows.len();
                (
                    vec![(CommandGroup::new().label(heading).items(rows), len)],
                    placeholder,
                )
            }
        }
    }
}

/// A palette row: label, then a drill-in chevron, key chips or a check.
fn row(
    label: &str,
    drill: bool,
    binding: Option<&'static str>,
    checked: bool,
    group: &str,
) -> CommandItem {
    let text: SharedString = label.to_owned().into();
    CommandItem::new()
        .label(text.clone())
        .keywords([group.to_owned()])
        .child(move |_, cx| {
            let muted = color(cx.ren_theme(), "text.muted");
            h_flex()
                .w_full()
                .items_center()
                .gap_2()
                .child(div().flex_1().child(text.clone()))
                .when(drill, |this| {
                    this.child(Icon::new(RenIcon::ChevronRight).size_4().text_color(muted))
                })
                .when_some(binding.filter(|_| !drill), |this, keys| {
                    this.child(kbd_group(keys, cx))
                })
                .when(checked, |this| {
                    this.child(Icon::new(RenIcon::Check).size_4())
                })
        })
}

impl Focusable for CommandPalette {
    fn focus_handle(&self, cx: &App) -> FocusHandle {
        self.state.read(cx).focus_handle(cx)
    }
}

impl Render for CommandPalette {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (groups, placeholder) = self.build(cx);
        let page = self.page;
        let theme = cx.ren_theme();
        let muted = color(theme, "text.muted");
        let border = color(theme, "border");
        let size = text_size(theme, "xs");
        let this = cx.entity().downgrade();
        let confirm = this.clone();
        let query = this.clone();
        let cancel = this.clone();
        // `IndexPath` rows count within each group; the entries are flat.
        let offsets: Vec<usize> = groups
            .iter()
            .scan(0, |offset, (_, len)| {
                let start = *offset;
                *offset += len;
                Some(start)
            })
            .collect();
        let command = groups
            .into_iter()
            .fold(Command::new(&self.state), |command, (group, _)| {
                command.group(group)
            });

        div().capture_action(cx.listener(Self::on_backspace)).child(
            command
                .bordered(false)
                .filterable(page != Page::GoToDate)
                .placeholder(placeholder)
                .max_h(px(360.))
                .on_query(move |text, _, cx| {
                    query
                        .update(cx, |palette, cx| {
                            palette.query = text.to_owned();
                            cx.notify();
                        })
                        .ok();
                })
                .on_confirm(move |path: IndexPath, window, cx| {
                    let index = offsets.get(path.section).copied().unwrap_or(0) + path.row;
                    confirm
                        .update(cx, |palette, cx| palette.confirm(index, window, cx))
                        .ok();
                })
                .on_cancel(move |window, cx| {
                    cancel
                        .update(cx, |palette, cx| palette.cancel(window, cx))
                        .ok();
                })
                .empty(move |state, _, cx| {
                    let text = match page {
                        Page::GoToDate if state.query(cx).is_empty() => {
                            "e.g. \"5 Sep\", \"next sunday\"..."
                        }
                        Page::GoToDate => "No matching date",
                        Page::Submenu(Submenu::Themes) => "No themes found.",
                        Page::Submenu(Submenu::CalendarGroups) => "No groups found.",
                        Page::Root => "No commands found.",
                    };
                    div()
                        .px_3()
                        .py_6()
                        .text_center()
                        .text_color(muted)
                        .child(text)
                })
                .footer(move |_, _, cx| {
                    h_flex()
                        .gap_4()
                        .px_3()
                        .py_2()
                        .border_t_1()
                        .border_color(border)
                        .text_size(size)
                        .text_color(muted)
                        .child(
                            h_flex()
                                .gap_1p5()
                                .child(kbd_group("up+down", cx))
                                .child("navigate"),
                        )
                        .child(
                            h_flex()
                                .gap_1p5()
                                .child(kbd_group("enter", cx))
                                .child("select"),
                        )
                        .child(
                            h_flex()
                                .gap_1p5()
                                .child(kbd_group("escape", cx))
                                .child(if page == Page::Root { "close" } else { "back" }),
                        )
                }),
        )
    }
}
