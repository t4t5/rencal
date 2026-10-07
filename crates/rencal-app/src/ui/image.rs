//! Images from `data:` URLs the backend hands over (plugin provider icons,
//! local plugin previews), which GPUI's loader can't read.

use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine;
use gpui_kit::{Image, ImageFormat, ImageSource};

thread_local! {
    /// Decoded `data:` URLs, so a render doesn't decode them again.
    static DECODED: RefCell<HashMap<String, Option<Arc<Image>>>> = RefCell::new(HashMap::new());
}

/// The image in a `data:` URL; `None` for any other URL, or one that
/// doesn't decode.
pub fn image_source(url: &str) -> Option<ImageSource> {
    if !url.starts_with("data:") {
        return None;
    }
    DECODED
        .with(|cache| {
            cache
                .borrow_mut()
                .entry(url.to_owned())
                .or_insert_with(|| decode_data_url(url).map(Arc::new))
                .clone()
        })
        .map(ImageSource::Image)
}

fn decode_data_url(url: &str) -> Option<Image> {
    let (header, data) = url.strip_prefix("data:")?.split_once(',')?;
    let mime = header.strip_suffix(";base64")?;
    let format = match mime {
        "image/svg+xml" => ImageFormat::Svg,
        "image/png" => ImageFormat::Png,
        "image/jpeg" => ImageFormat::Jpeg,
        "image/webp" => ImageFormat::Webp,
        "image/gif" => ImageFormat::Gif,
        _ => return None,
    };
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .ok()?;
    Some(Image::from_bytes(format, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base64_data_urls() {
        let image = decode_data_url("data:image/png;base64,AA==").unwrap();
        assert_eq!(image.format, ImageFormat::Png);
        assert_eq!(image.bytes, vec![0]);
        assert!(decode_data_url("data:text/plain;base64,AA==").is_none());
        assert!(decode_data_url("data:image/png,raw").is_none());
        assert!(image_source("file:///etc/passwd").is_none());
        assert!(image_source("https://rencal.org/plugin-previews/a.png").is_none());
    }
}
