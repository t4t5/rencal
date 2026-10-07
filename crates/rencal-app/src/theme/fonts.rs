//! Fonts embedded in the binary, registered with GPUI's text system at
//! startup so themes can name them like installed families.

use std::borrow::Cow;

use gpui_kit::App;

/// `Geist Mono`, the baseline `font.mono`.
const GEIST_MONO: &[u8] = include_bytes!("../../assets/fonts/GeistMono-Regular.ttf");

pub fn register(cx: &App) {
    if let Err(err) = cx.text_system().add_fonts(vec![Cow::Borrowed(GEIST_MONO)]) {
        log::error!("could not register the embedded fonts: {err}");
    }
}
