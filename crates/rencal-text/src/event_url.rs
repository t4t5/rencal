//! Web links in event text (port of `src/lib/event-url.ts`): finding links in
//! free text, making a typed link openable, and the one link worth showing for
//! an event that has no explicit URL.

use serde::Serialize;

use crate::conference::{EventLinks, detect_conference};

/// Make a typed link openable: `example.com` → `https://example.com`. Anything
/// with a scheme (`mailto:`, `tel:`, `ftp://`) is kept.
pub fn to_openable_url(url: &str) -> String {
    if has_scheme(url) {
        url.to_owned()
    } else {
        format!("https://{url}")
    }
}

/// `/^[a-z][a-z0-9+.-]*:/i`
fn has_scheme(url: &str) -> bool {
    let mut chars = url.chars();
    if !chars.next().is_some_and(|c| c.is_ascii_alphabetic()) {
        return false;
    }
    for c in chars {
        if c == ':' {
            return true;
        }
        if !(c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-')) {
            return false;
        }
    }
    false
}

/// JS `\s`.
fn is_js_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// Characters that end a link: whitespace, HTML brackets and quotes.
fn ends_link(c: char) -> bool {
    is_js_space(c) || matches!(c, '<' | '>' | '"' | '\'')
}

/// The length of a link prefix at the start of `rest` (`http://`, `https://`
/// or, at a word boundary, `www.`), case-insensitive.
fn link_prefix_len(rest: &str, prev: Option<char>) -> Option<usize> {
    let starts = |prefix: &str| {
        rest.get(..prefix.len())
            .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
    };
    if starts("https://") {
        Some(8)
    } else if starts("http://") {
        Some(7)
    } else if starts("www.") && !prev.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_') {
        Some(4)
    } else {
        None
    }
}

/// Strip punctuation that trails a link in prose, e.g. `(see https://x.y/z).`
/// Closing brackets are only stripped when unbalanced, so
/// `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its `)`.
fn trim_trailing_punctuation(url: &str) -> &str {
    let mut end = url.len();
    while let Some(c) = url[..end].chars().next_back() {
        let head = &url[..end];
        let strip = match c {
            '.' | ',' | ';' | ':' | '!' | '?' => true,
            ')' => head.matches('(').count() < head.matches(')').count(),
            ']' => head.matches('[').count() < head.matches(']').count(),
            _ => false,
        };
        if !strip {
            break;
        }
        end -= 1;
    }
    &url[..end]
}

/// All web links (`http(s)://…` and `www.…`) in free-form text, in order of
/// appearance (`/(?:https?:\/\/|\bwww\.)[^\s<>"']+/gi`, then trimmed).
pub fn find_urls(text: Option<&str>) -> Vec<String> {
    let Some(text) = text else {
        return Vec::new();
    };
    let mut urls = Vec::new();
    let mut prev = None;
    let mut i = 0;
    while let Some(c) = text[i..].chars().next() {
        if let Some(prefix) = link_prefix_len(&text[i..], prev) {
            let tail = text[i + prefix..]
                .find(ends_link)
                .map_or(text.len(), |n| i + prefix + n);
            if tail > i + prefix {
                urls.push(trim_trailing_punctuation(&text[i..tail]).to_owned());
                prev = text[..tail].chars().next_back();
                i = tail;
                continue;
            }
        }
        prev = Some(c);
        i += c.len_utf8();
    }
    urls
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DetectedUrlSource {
    Location,
    Description,
}

impl DetectedUrlSource {
    pub fn label(self) -> &'static str {
        match self {
            Self::Location => "Linked in event location",
            Self::Description => "Linked in event notes",
        }
    }
}

/// A link found in an event's free-form text, unlike its explicit `url` field.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct DetectedUrl {
    pub url: String,
    pub source: DetectedUrlSource,
}

impl EventLinks<'_> {
    /// The first link in the location, then the notes, that the event popover
    /// doesn't already show: as the explicit URL field, or as the video meeting
    /// (a stored conference or a meeting link in the location). Meeting links
    /// in the notes of an event that has a video meeting are skipped too, since
    /// Google/Outlook restate them there.
    pub fn detect_url(&self) -> Option<DetectedUrl> {
        let explicit = self.url.map(str::trim).unwrap_or_default();
        let explicit = (!explicit.is_empty()).then(|| to_openable_url(explicit));
        let meeting_url = self.meeting_url();
        let has_meeting = self.has_video_meeting();

        let shown_elsewhere = |url: &str| {
            explicit
                .as_deref()
                .is_some_and(|explicit| to_openable_url(url) == explicit)
                || meeting_url.as_deref() == Some(url)
                || (has_meeting && detect_conference(Some(url)).is_some())
        };

        [
            (DetectedUrlSource::Location, self.location),
            (DetectedUrlSource::Description, self.description),
        ]
        .into_iter()
        .find_map(|(source, text)| {
            let url = find_urls(text).into_iter().find(|u| !shown_elsewhere(u))?;
            Some(DetectedUrl { url, source })
        })
    }
}
