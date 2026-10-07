//! Date and time recognition: a port of the part of chrono-node 2.9 the magic
//! parser used (`chrono.parse(text, ref, { forwardDate: true })`, English
//! casual configuration).
//!
//! Same architecture as chrono-node: every parser scans the whole text for its
//! pattern and yields results (a span plus start/end `Components` whose fields
//! are known or implied); the results are sorted by position and run through
//! the refiners, which merge neighbours (`tomorrow` + `at 3pm`, `june 15` +
//! `to` + `june 18`), push ambiguous dates forward and drop unlikely ones. The
//! regexes are hand-written matchers (`scan`) that try alternatives in the
//! same order, so quirks of the original carry over.

mod components;
mod lexicon;
mod parsers;
mod refiners;
mod scan;
mod time;

use std::ops::Range;

use chrono::NaiveDateTime;
use rencal_time::Tz;

use components::{Components, Field, Reference};
use scan::Text;

pub(crate) use scan::{is_space, is_word, js_trim};

/// One recognised date or time.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct DateMatch {
    /// Byte range in the parsed text.
    pub range: Range<usize>,
    /// No clock time was given (chrono-node: hour not certain).
    pub all_day: bool,
    /// Local wallclock in the parse's zone.
    pub start: NaiveDateTime,
    pub end: Option<NaiveDateTime>,
}

/// What every parser and refiner sees: the text and the reference "now".
pub(crate) struct Context {
    text: Text,
    reference: Reference,
}

impl Context {
    /// Fresh components implied from the reference.
    fn components(&self) -> Components {
        Components::new(self.reference)
    }
}

/// Every date in `text`, in order. `now` is the viewer's wallclock in `tz`.
pub(crate) fn parse(text: &str, now: NaiveDateTime, tz: Tz) -> Vec<DateMatch> {
    let ctx = Context {
        text: Text::new(text),
        reference: Reference::new(now, tz),
    };
    let mut results: Vec<_> = parsers::PARSERS
        .iter()
        .flat_map(|&parser| parsers::run(&ctx, parser))
        .collect();
    results.sort_by_key(|result| result.span.start);
    refiners::refine(&ctx, results)
        .into_iter()
        .map(|result| DateMatch {
            range: ctx.text.byte_range(result.span),
            all_day: !result.start.is_certain(Field::Hour),
            start: result.start.date(),
            end: result.end.map(|end| end.date()),
        })
        .collect()
}
