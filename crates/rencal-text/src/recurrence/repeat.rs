//! The repeat picker's choices and label (port of the pure parts of
//! `src/components/event-parts/inputs/RepeatSelect.tsx`).

use super::rule::{Frequency, Part, RRule};
use super::set::RRuleSet;

/// A picker entry: a rule and its menu label.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepeatPreset {
    pub rule: RRule,
    pub label: &'static str,
}

/// The picker's presets, in menu order (after "No repeat").
pub fn repeat_presets() -> [RepeatPreset; 5] {
    let preset = |rule, label| RepeatPreset { rule, label };
    [
        preset(RRule::new(Frequency::Daily), "Every day"),
        preset(RRule::new(Frequency::Weekly), "Every week"),
        preset(
            RRule::new(Frequency::Weekly).with(Part::Interval(2)),
            "Every 2 weeks",
        ),
        preset(RRule::new(Frequency::Monthly), "Every month"),
        preset(RRule::new(Frequency::Yearly), "Every year"),
    ]
}

/// The preset `value` is, compared as printed rules (so a weekly rule with an
/// EXDATE is not the "Every week" preset).
pub fn selected_preset(value: &RRuleSet) -> Option<RepeatPreset> {
    let printed = value.to_string();
    repeat_presets()
        .into_iter()
        .find(|p| p.rule.to_string() == printed)
}

/// The picker's label for `value`: the preset label, else rrule.js's English
/// text for the rule ("every week on Monday").
pub fn repeat_label(value: &RRuleSet) -> String {
    match selected_preset(value) {
        Some(preset) => preset.label.into(),
        None => value.rrule.to_text(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(rule: &str) -> RRuleSet {
        RRuleSet::new(rule.parse().unwrap())
    }

    #[test]
    fn labels_presets_and_custom_rules() {
        assert_eq!(
            repeat_label(&set("FREQ=WEEKLY;INTERVAL=2")),
            "Every 2 weeks"
        );
        assert_eq!(
            repeat_label(&set("FREQ=WEEKLY;BYDAY=MO")),
            "every week on Monday"
        );
        // Written differently from the preset, so not the preset.
        assert_eq!(repeat_label(&set("FREQ=DAILY;INTERVAL=1")), "every day");
    }
}
