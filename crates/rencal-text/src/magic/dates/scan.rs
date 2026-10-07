//! Character-level matching with JavaScript regex semantics.
//!
//! chrono-node's grammar is a set of backtracking regexes. The matchers here
//! return every way a piece can match, in the order a backtracking engine tries
//! them (greedy pieces longest first), so a pattern is a nest of `for` loops
//! that returns at the first complete match. Positions are char indices.

use std::ops::Range;

/// JS `\w` (no `u` flag): ASCII letters, digits and `_`.
pub(crate) fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// JS `\s`.
pub(crate) fn is_space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

/// JS `String.prototype.trim`.
pub(crate) fn js_trim(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// The input as chars, with the byte offset of each for converting spans back.
pub(crate) struct Text {
    chars: Vec<char>,
    bytes: Vec<usize>,
}

impl Text {
    pub fn new(s: &str) -> Self {
        let (bytes, chars) = s.char_indices().unzip::<_, _, Vec<_>, Vec<_>>();
        let mut bytes = bytes;
        bytes.push(s.len());
        Self { chars, bytes }
    }

    pub fn len(&self) -> usize {
        self.chars.len()
    }

    pub fn at(&self, pos: usize) -> Option<char> {
        self.chars.get(pos).copied()
    }

    pub fn slice(&self, range: Range<usize>) -> String {
        self.chars[range].iter().collect()
    }

    pub fn byte_range(&self, range: Range<usize>) -> Range<usize> {
        self.bytes[range.start]..self.bytes[range.end]
    }

    /// A case-insensitive literal at `pos`; returns its end.
    pub fn lit(&self, pos: usize, word: &str) -> Option<usize> {
        let mut end = pos;
        for expected in word.chars() {
            if !self.at(end)?.eq_ignore_ascii_case(&expected) {
                return None;
            }
            end += 1;
        }
        Some(end)
    }

    /// Ends of the alternatives in `words` that match at `pos`, in order.
    pub fn alts(&self, pos: usize, words: &[&str]) -> Vec<usize> {
        words.iter().filter_map(|w| self.lit(pos, w)).collect()
    }

    /// Dictionary words matching at `pos` with their values, longest first
    /// (chrono-node's `matchAnyPattern` sorts alternatives by length).
    pub fn words<T: Copy>(&self, pos: usize, dict: &[(&str, T)]) -> Vec<(usize, T)> {
        let mut found: Vec<_> = dict
            .iter()
            .filter_map(|&(word, value)| Some((self.lit(pos, word)?, value)))
            .collect();
        found.sort_by_key(|&(end, _)| std::cmp::Reverse(end));
        found
    }

    /// Length of the run of chars matching `pred` from `pos`.
    pub fn run(&self, pos: usize, pred: impl Fn(char) -> bool) -> usize {
        self.chars
            .get(pos..)
            .map_or(0, |rest| rest.iter().take_while(|&&c| pred(c)).count())
    }

    pub fn digits(&self, pos: usize) -> usize {
        self.run(pos, |c| c.is_ascii_digit())
    }

    /// `\d{min,max}` at `pos`: candidate ranges, longest first.
    pub fn digit_runs(&self, pos: usize, min: usize, max: usize) -> Vec<Range<usize>> {
        (min..=self.digits(pos).min(max))
            .rev()
            .map(|len| pos..pos + len)
            .collect()
    }

    /// `\s{min,max}`: candidate ends, longest first.
    pub fn spaces(&self, pos: usize, min: usize, max: usize) -> impl Iterator<Item = usize> {
        let n = self.run(pos, is_space).min(max);
        (min..=n).rev().map(move |k| pos + k)
    }

    /// `\s*`: candidate ends, longest first.
    pub fn any_spaces(&self, pos: usize) -> impl Iterator<Item = usize> {
        self.spaces(pos, 0, usize::MAX)
    }

    /// The end of the whitespace run at `pos`.
    pub fn skip_spaces(&self, pos: usize) -> usize {
        pos + self.run(pos, is_space)
    }

    /// `(?=\W|$)`
    pub fn ends_word(&self, pos: usize) -> bool {
        self.at(pos).is_none_or(|c| !is_word(c))
    }

    /// `\b`
    pub fn is_boundary(&self, pos: usize) -> bool {
        let before = pos > 0 && self.at(pos - 1).is_some_and(is_word);
        before != self.at(pos).is_some_and(is_word)
    }
}

/// Drop repeated positions, keeping the first (what follows a piece depends
/// only on where it ended, so later duplicates can never match differently).
pub(crate) fn dedup(positions: Vec<usize>) -> Vec<usize> {
    let mut seen = Vec::with_capacity(positions.len());
    for pos in positions {
        if !seen.contains(&pos) {
            seen.push(pos);
        }
    }
    seen
}

/// chrono-node's `AbstractParserWithWordBoundaryChecking`: the pattern is
/// `(\W|^)inner`, run on the text from `from` (so `^` is `from`). Returns the
/// first position where `inner` matches, in the order the regex tries them.
pub(crate) fn word_bounded<M>(
    text: &Text,
    from: usize,
    inner: impl Fn(usize) -> Option<M>,
) -> Option<(usize, M)> {
    for p in from..=text.len() {
        if text.at(p).is_some_and(|c| !is_word(c))
            && let Some(m) = inner(p + 1)
        {
            return Some((p + 1, m));
        }
        if p == from
            && let Some(m) = inner(p)
        {
            return Some((p, m));
        }
    }
    None
}
