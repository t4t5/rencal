//! Shown instead of the main window when renCal cannot start (an unreadable
//! caldir config, no plugin storage). Quitting is the only way out. Settings
//! and the theme store never loaded, so it paints with gpui-kit's theme.

use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::{ActiveTheme, v_flex};
use gpui_kit::{
    App, AppContext, Context, IntoElement, ParentElement, Render, SharedString, Styled, Window,
    div, px, size,
};

use super::{default_traffic_lights, drag_region, window_options};

pub fn open(message: String, cx: &mut App) {
    log::error!("{message}");
    let options = window_options(size(px(480.), px(240.)), None, default_traffic_lights(), cx);
    let opened = gpui_kit::open_window(options, cx, |_, cx| {
        cx.new(|_| Fatal {
            message: message.into(),
        })
    });
    if let Err(err) = opened {
        log::error!("could not open the error window: {err}");
        cx.quit();
    }
}

struct Fatal {
    message: SharedString,
}

impl Render for Fatal {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        v_flex()
            .size_full()
            .child(drag_region("fatal-drag").h(px(28.)).flex_shrink_0())
            .child(
                v_flex()
                    .flex_1()
                    .gap_4()
                    .px_6()
                    .pb_6()
                    .child(div().text_lg().child("renCal cannot start"))
                    .child(
                        div()
                            .flex_1()
                            .text_sm()
                            .text_color(cx.theme().muted_foreground)
                            .child(self.message.clone()),
                    )
                    .child(
                        Button::new("quit")
                            .primary()
                            .label("Quit")
                            .on_click(|_, _, cx| cx.quit()),
                    ),
            )
    }
}
