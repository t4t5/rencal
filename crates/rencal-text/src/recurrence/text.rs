//! `RRule::to_text`: rrule.js's English `toText()` (the repeat picker's label
//! for rules that aren't presets), quirks included.

use chrono::{Datelike, Weekday};

use super::rule::{Frequency, NWeekday, Part, RRule};

const MONTH_NAMES: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

fn day_name(weekday: Weekday) -> &'static str {
    match weekday {
        Weekday::Mon => "Monday",
        Weekday::Tue => "Tuesday",
        Weekday::Wed => "Wednesday",
        Weekday::Thu => "Thursday",
        Weekday::Fri => "Friday",
        Weekday::Sat => "Saturday",
        Weekday::Sun => "Sunday",
    }
}

fn plural(n: u32) -> bool {
    n % 100 != 1
}

/// `1st`, `22nd`, `last`, `2nd last`.
fn nth(n: i32) -> String {
    if n == -1 {
        return "last".into();
    }
    let npos = n.unsigned_abs();
    let suffix = match npos {
        1 | 21 | 31 => "st",
        2 | 22 => "nd",
        3 | 23 => "rd",
        _ => "th",
    };
    if n < 0 {
        format!("{npos}{suffix} last")
    } else {
        format!("{npos}{suffix}")
    }
}

fn weekday_text(day: &NWeekday) -> String {
    match day.n {
        Some(n) => format!("{} {}", nth(n), day_name(day.weekday)),
        None => day_name(day.weekday).into(),
    }
}

fn month_text(month: i32) -> String {
    usize::try_from(month - 1)
        .ok()
        .and_then(|i| MONTH_NAMES.get(i))
        .map_or_else(|| "undefined".into(), |name| (*name).into())
}

/// rrule.js `ToText.list`: `a, b and c` with a final delimiter, else `a, b, c`.
fn list(items: Vec<String>, final_delim: Option<&str>) -> String {
    let Some(final_delim) = final_delim else {
        return items.join(", ");
    };
    let mut out = String::new();
    let last = items.len().saturating_sub(1);
    for (i, item) in items.into_iter().enumerate() {
        if i != 0 {
            if i == last {
                out.push_str(&format!(" {final_delim} "));
            } else {
                out.push_str(", ");
            }
        }
        out.push_str(&item);
    }
    out
}

struct ByWeekday {
    all_weeks: Vec<NWeekday>,
    some_weeks: Vec<NWeekday>,
    is_weekdays: bool,
    is_every_day: bool,
}

struct ToText<'a> {
    rule: &'a RRule,
    interval: u32,
    by_month_day: Option<Vec<i32>>,
    by_weekday: Option<ByWeekday>,
    text: Vec<String>,
}

impl<'a> ToText<'a> {
    fn new(rule: &'a RRule) -> Self {
        // Positive days ascending, then negative ones from -1 down.
        let by_month_day = rule.list(Part::ByMonthDay).and_then(|days| {
            let mut positive: Vec<i32> = days.iter().copied().filter(|d| *d > 0).collect();
            let mut negative: Vec<i32> = days.iter().copied().filter(|d| *d < 0).collect();
            positive.sort_unstable();
            negative.sort_unstable_by(|a, b| b.cmp(a));
            positive.extend(negative);
            (!positive.is_empty()).then_some(positive)
        });

        let by_weekday = rule.by_day().map(|days| {
            let has = |w: Weekday| days.iter().any(|d| d.weekday == w);
            let weekdays = [
                Weekday::Mon,
                Weekday::Tue,
                Weekday::Wed,
                Weekday::Thu,
                Weekday::Fri,
            ]
            .into_iter()
            .all(has);
            let weekend = has(Weekday::Sat) && has(Weekday::Sun);
            let weekend_any = has(Weekday::Sat) || has(Weekday::Sun);
            let sorted = |nth: bool| {
                let mut v: Vec<NWeekday> = days
                    .iter()
                    .copied()
                    .filter(|d| d.n.is_some() == nth)
                    .collect();
                v.sort_by_key(|d| d.weekday.num_days_from_monday());
                v
            };
            ByWeekday {
                all_weeks: sorted(false),
                some_weeks: sorted(true),
                is_weekdays: weekdays && !weekend_any,
                is_every_day: weekdays && weekend,
            }
        });

        Self {
            rule,
            interval: rule.interval(),
            by_month_day,
            by_weekday,
            text: Vec::new(),
        }
    }

    fn add(&mut self, s: impl Into<String>) -> &mut Self {
        self.text.push(" ".into());
        self.text.push(s.into());
        self
    }

    fn add_interval(&mut self) {
        if self.interval != 1 {
            self.add(self.interval.to_string());
        }
    }

    fn unit(&mut self, one: &str, many: &str) {
        let word = if plural(self.interval) { many } else { one };
        self.add(word);
    }

    fn is_weekdays(&self) -> bool {
        self.by_weekday.as_ref().is_some_and(|w| w.is_weekdays)
    }

    fn render(mut self) -> String {
        let freq = self.rule.freq();
        if freq == Frequency::Secondly {
            return "RRule error: Unable to fully convert this rrule to text".into();
        }
        self.text.push("every".into());
        match freq {
            Frequency::Hourly => {
                self.add_interval();
                self.unit("hour", "hours");
            }
            Frequency::Minutely => {
                self.add_interval();
                self.unit("minute", "minutes");
            }
            Frequency::Daily => self.daily(),
            Frequency::Weekly => self.weekly(),
            Frequency::Monthly => self.monthly(),
            Frequency::Yearly => self.yearly(),
            Frequency::Secondly => unreachable!(),
        }

        if let Some(until) = self.rule.until() {
            let month = MONTH_NAMES[until.month0() as usize];
            self.add("until")
                .add(format!("{month} {}, {}", until.day(), until.year()));
        } else if let Some(count) = self.rule.count().filter(|c| *c != 0) {
            self.add("for")
                .add(count.to_string())
                .add(if plural(count) { "times" } else { "time" });
        }

        if !is_fully_convertible(self.rule) {
            self.add("(~ approximate)");
        }
        self.text.concat()
    }

    fn daily(&mut self) {
        self.add_interval();
        if self.is_weekdays() {
            self.unit("weekday", "weekdays");
        } else {
            self.unit("day", "days");
        }
        if self.rule.list(Part::ByMonth).is_some() {
            self.add("in");
            self.by_month();
        }
        if self.by_month_day.is_some() {
            self.by_month_day();
        } else if self.by_weekday.is_some() {
            self.by_weekday();
        } else if self.rule.list(Part::ByHour).is_some() {
            self.by_hour();
        }
    }

    fn weekly(&mut self) {
        if self.interval != 1 {
            self.add(self.interval.to_string());
            self.unit("week", "weeks");
        }
        if self.is_weekdays() {
            if self.interval == 1 {
                self.unit("weekday", "weekdays");
            } else {
                self.add("on").add("weekdays");
            }
        } else if self.by_weekday.as_ref().is_some_and(|w| w.is_every_day) {
            self.unit("day", "days");
        } else {
            if self.interval == 1 {
                self.add("week");
            }
            if self.rule.list(Part::ByMonth).is_some() {
                self.add("in");
                self.by_month();
            }
            if self.by_month_day.is_some() {
                self.by_month_day();
            } else if self.by_weekday.is_some() {
                self.by_weekday();
            }
            if self.rule.list(Part::ByHour).is_some() {
                self.by_hour();
            }
        }
    }

    fn monthly(&mut self) {
        if self.rule.list(Part::ByMonth).is_some() {
            if self.interval != 1 {
                self.add(self.interval.to_string()).add("months");
                if plural(self.interval) {
                    self.add("in");
                }
            }
            self.by_month();
        } else {
            self.add_interval();
            self.unit("month", "months");
        }
        if self.by_month_day.is_some() {
            self.by_month_day();
        } else if self.is_weekdays() {
            self.add("on").add("weekdays");
        } else if self.by_weekday.is_some() {
            self.by_weekday();
        }
    }

    fn yearly(&mut self) {
        if self.rule.list(Part::ByMonth).is_some() {
            if self.interval != 1 {
                self.add(self.interval.to_string()).add("years");
            }
            self.by_month();
        } else {
            self.add_interval();
            self.unit("year", "years");
        }
        if self.by_month_day.is_some() {
            self.by_month_day();
        } else if self.by_weekday.is_some() {
            self.by_weekday();
        }
        if let Some(days) = self.rule.list(Part::ByYearDay) {
            let days = list(days.iter().map(|d| nth(*d)).collect(), Some("and"));
            self.add("on the").add(days).add("day");
        }
        if let Some(weeks) = self.rule.list(Part::ByWeekNo) {
            let unit = if plural(weeks.len() as u32) {
                "weeks"
            } else {
                "week"
            };
            let weeks = list(weeks.iter().map(ToString::to_string).collect(), Some("and"));
            self.add("in").add(unit).add(weeks);
        }
    }

    fn by_month_day(&mut self) {
        let days = self.by_month_day.clone().unwrap_or_default();
        let all_weeks = self
            .by_weekday
            .as_ref()
            .map(|w| w.all_weeks.clone())
            .filter(|w| !w.is_empty());
        if let Some(all_weeks) = all_weeks {
            let weekdays = list(all_weeks.iter().map(weekday_text).collect(), Some("or"));
            let days = list(days.into_iter().map(nth).collect(), Some("or"));
            self.add("on").add(weekdays).add("the").add(days);
        } else {
            let days = list(days.into_iter().map(nth).collect(), Some("and"));
            self.add("on the").add(days);
        }
    }

    fn by_weekday(&mut self) {
        let Some(w) = self.by_weekday.as_ref() else {
            return;
        };
        let (all, some, is_weekdays) = (w.all_weeks.clone(), w.some_weeks.clone(), w.is_weekdays);
        if !all.is_empty() && !is_weekdays {
            self.add("on")
                .add(list(all.iter().map(weekday_text).collect(), None));
        }
        if !some.is_empty() {
            if !all.is_empty() {
                self.add("and");
            }
            self.add("on the")
                .add(list(some.iter().map(weekday_text).collect(), Some("and")));
        }
    }

    fn by_hour(&mut self) {
        let hours = self.rule.list(Part::ByHour).unwrap_or_default();
        let hours = list(hours.iter().map(ToString::to_string).collect(), Some("and"));
        self.add("at").add(hours);
    }

    fn by_month(&mut self) {
        let months = self.rule.list(Part::ByMonth).unwrap_or_default();
        let months = list(months.iter().map(|m| month_text(*m)).collect(), Some("and"));
        self.add(months);
    }
}

/// rrule.js `ToText.isFullyConvertible`, including its early `return true` at
/// the first `freq`/`wkst` key: only parts listed before FREQ are checked.
fn is_fully_convertible(rule: &RRule) -> bool {
    let freq = rule.freq();
    if freq == Frequency::Secondly
        || (rule.until().is_some() && rule.count().is_some_and(|c| c != 0))
    {
        return false;
    }
    for part in rule.parts() {
        let name = part.option_name();
        if matches!(name, "freq" | "wkst") {
            return true;
        }
        let implemented = matches!(
            name,
            "count" | "until" | "interval" | "byweekday" | "bymonthday" | "bymonth"
        ) || (freq == Frequency::Daily && name == "byhour")
            || (freq == Frequency::Yearly && matches!(name, "byweekno" | "byyearday"));
        if !implemented {
            return false;
        }
    }
    true
}

impl RRule {
    /// rrule.js `toText()`: "every week on Monday", "every 2 weeks",
    /// "every day until June 25, 2026". Parts it can't express are left out and
    /// "(~ approximate)" is appended (subject to rrule.js's ordering quirk).
    pub fn to_text(&self) -> String {
        ToText::new(self).render()
    }
}

// Expected strings checked against rrule.js 2.8.1.
#[cfg(test)]
mod tests {
    use super::*;

    fn text(rule: &str) -> String {
        rule.parse::<RRule>().unwrap().to_text()
    }

    #[test]
    fn describes_common_rules() {
        assert_eq!(
            text("FREQ=MONTHLY;BYMONTHDAY=1,-1"),
            "every month on the 1st and last"
        );
        assert_eq!(text("FREQ=DAILY;INTERVAL=3"), "every 3 days");
        assert_eq!(text("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU"), "every day");
        assert_eq!(text("FREQ=YEARLY;COUNT=1"), "every year for 1 time");
        assert_eq!(text("FREQ=HOURLY;INTERVAL=2"), "every 2 hours");
        assert_eq!(
            text("FREQ=MONTHLY;BYDAY=MO,-2FR"),
            "every month on Monday and on the 2nd last Friday"
        );
        assert_eq!(
            text("FREQ=YEARLY;BYYEARDAY=1,100;BYWEEKNO=3"),
            "every year on the 1st and 100th day in week 3"
        );
        assert_eq!(
            text("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TU,WE,TH,FR"),
            "every 2 weeks on weekdays"
        );
        assert_eq!(
            text("FREQ=MONTHLY;INTERVAL=2;BYMONTH=1,6;BYMONTHDAY=3"),
            "every 2 months in January and June on the 3rd"
        );
    }

    #[test]
    fn approximate_only_when_an_unsupported_part_precedes_freq() {
        assert_eq!(
            text("BYSETPOS=1;FREQ=MONTHLY;BYDAY=MO"),
            "every month on Monday (~ approximate)"
        );
        assert_eq!(
            text("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1"),
            "every month on Monday"
        );
        assert_eq!(
            text("FREQ=DAILY;COUNT=2;UNTIL=20260101"),
            "every day until January 1, 2026 (~ approximate)"
        );
        assert_eq!(
            text("FREQ=SECONDLY"),
            "RRule error: Unable to fully convert this rrule to text"
        );
    }
}
