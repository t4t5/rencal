//! The sidebar (port of `components/sidebar/`): its toolbar, the minical and
//! the agenda. Below the `md` breakpoint it fills the window and its toolbar
//! carries the header's controls.

pub mod agenda;
pub mod minical;

use gpui_kit::component::{h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    AppContext, Context, Entity, InteractiveElement, IntoElement, ParentElement, Render, Styled,
    Subscription, Window, px,
};

use crate::editing::compose::Compose;
use crate::editing::draft::DraftState;
use crate::sync_state::SyncState;
use crate::theme::ThemeStore;
use crate::toolbar;
use crate::ui::metric;
use crate::windows::drag_region;
use agenda::Agenda;
use minical::Minical;

/// The macOS traffic lights sit left of the sidebar toolbar.
pub const MACOS_TRAFFIC_LIGHTS_WIDTH: f32 = 78.0;

pub struct Sidebar {
    compose: Entity<Compose>,
    minical: Entity<Minical>,
    agenda: Entity<Agenda>,
    /// Below `md`: the sidebar is the whole window.
    narrow: bool,
    _subscriptions: Vec<Subscription>,
    _compose_subscriptions: Vec<Subscription>,
}

impl Sidebar {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let minical = cx.new(|cx| Minical::new(window, cx));
        let agenda = cx.new(|cx| Agenda::new(window, cx));
        let compose = cx.new(|cx| Compose::new(window, cx));
        let draft = DraftState::global(cx);
        Self {
            _compose_subscriptions: vec![
                cx.observe(&compose, |_, _, cx| cx.notify()),
                cx.observe(&draft, |_, _, cx| cx.notify()),
            ],
            compose,
            minical,
            agenda,
            narrow: false,
            _subscriptions: vec![
                cx.observe_global::<SyncState>(|this, cx| {
                    if this.narrow {
                        cx.notify();
                    }
                }),
                cx.observe_global::<toolbar::InvitesOpen>(|this, cx| {
                    if this.narrow {
                        cx.notify();
                    }
                }),
            ],
        }
    }

    pub fn agenda(&self) -> &Entity<Agenda> {
        &self.agenda
    }

    pub fn set_narrow(&mut self, narrow: bool) {
        self.narrow = narrow;
    }
}

impl Render for Sidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = ThemeStore::active(cx);
        let padding = metric(&theme, "layout.padding");
        let narrow = self.narrow;
        let macos_inset = cfg!(target_os = "macos") && !window.is_fullscreen() && narrow;
        let invites = narrow.then(|| toolbar::invites_badge(cx)).flatten();
        let expanded = self.compose.read(cx).is_expanded(cx);
        let (compose, card) = self.compose.update(cx, |compose, cx| {
            (
                compose.render_button(window, cx),
                compose.render_card(window, cx),
            )
        });

        let toolbar = h_flex()
            .id("sidebar-toolbar")
            .items_center()
            .gap_3()
            .when(macos_inset, |this| this.pl(px(MACOS_TRAFFIC_LIGHTS_WIDTH)))
            .when(!narrow && !expanded, |this| {
                this.child(drag_region("sidebar-drag").flex_1().h(px(34.)))
            })
            .child(compose)
            // Composing in a narrow window, the input takes the whole row.
            .when(narrow && !expanded, |this| {
                this.child(drag_region("sidebar-drag").flex_1().h(px(34.)))
                    .child(
                        h_flex()
                            .gap_2()
                            .items_center()
                            .child(toolbar::sync_status(cx))
                            .children(invites)
                            .child(toolbar::settings_button())
                            .child(toolbar::search_button()),
                    )
            });

        v_flex()
            .size_full()
            .child(v_flex().p(padding).pb_0().child(toolbar).children(card))
            .child(self.minical.clone())
            .child(self.agenda.clone())
    }
}
