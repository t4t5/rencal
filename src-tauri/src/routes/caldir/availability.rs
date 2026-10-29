//! Shared by the availability routes: lookup by id, the summary and details
//! DTOs, and evaluating a preview source against busy time.

use caldir_core::availability::{Availability, AvailabilityError, AvailabilityFile};
use caldir_core::{Caldir, Interval};
use chrono::{DateTime, Duration, DurationRound, Utc};
use chrono_tz::Tz;

use super::availability_draft::{apply, decompose, from_span, parse_tz};
use super::types::{AvailabilityDetails, AvailabilitySummary, PreviewSource};
use crate::routes::TauResult;
use crate::routes::error::{RpcError, RpcErrorKind};

/// Now rounded up to the minute, like `caldir free`, so windows don't start at
/// odd seconds.
pub(super) fn now() -> DateTime<Utc> {
    let now = Utc::now();
    now.duration_round_up(Duration::minutes(1)).unwrap_or(now)
}

pub(super) fn system_tzid() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".to_string())
}

/// The file an id (`dir/slug`) names.
pub(super) fn find(caldir: &Caldir, id: &str) -> TauResult<AvailabilityFile> {
    let not_found = || {
        RpcError::new(
            RpcErrorKind::AvailabilityNotFound,
            format!("Availability not found: {id}"),
        )
    };
    let (dir_slug, slug) = id.split_once('/').ok_or_else(not_found)?;
    let dir = caldir
        .availability_dirs()
        .into_iter()
        .find(|dir| dir.slug() == Some(dir_slug))
        .ok_or_else(not_found)?;

    match dir.get(slug) {
        Err(AvailabilityError::NotFound(_)) => Err(not_found()),
        result => Ok(result?),
    }
}

/// What `caldir free` would accept for `file`.
pub(super) fn reference(caldir: &Caldir, file: &AvailabilityFile) -> TauResult<String> {
    let id = file.qualified_reference();
    Ok(caldir
        .availabilities()?
        .into_iter()
        .find(|(_, other)| other.qualified_reference() == id)
        .map(|(reference, _)| reference)
        .unwrap_or(id))
}

pub(super) fn summary(reference: String, file: &AvailabilityFile) -> AvailabilitySummary {
    let availability = file.availability();
    AvailabilitySummary {
        id: file.qualified_reference(),
        name: display_name(file),
        reference,
        duration_minutes: availability.rules.duration.num_minutes().max(0) as u32,
        tzid: availability.tzid().map(str::to_string),
    }
}

pub(super) fn details(reference: String, file: &AvailabilityFile) -> AvailabilityDetails {
    let availability = file.availability();
    let decomposed = decompose(availability, &system_tzid());
    AvailabilityDetails {
        id: file.qualified_reference(),
        reference,
        draft: decomposed.draft,
        hours_editable: decomposed.hours_editable,
        override_count: availability.overrides.len() as u32,
    }
}

/// `SUMMARY`, else the filename.
pub(super) fn display_name(file: &AvailabilityFile) -> String {
    file.availability()
        .summary
        .clone()
        .unwrap_or_else(|| file.slug().unwrap_or_default().to_string())
}

/// A preview source, resolved to what core evaluates.
pub(super) enum Resolved {
    Availability {
        availability: Box<Availability>,
        /// Shown at the top of the copied text, as `caldir free <ref>` does.
        name: String,
    },
    Ranges {
        ranges: Vec<Interval>,
        tz: Tz,
    },
}

pub(super) fn resolve(caldir: &Caldir, source: PreviewSource) -> TauResult<Resolved> {
    Ok(match source {
        PreviewSource::Saved { id } => {
            let file = find(caldir, &id)?;
            Resolved::Availability {
                name: display_name(&file),
                availability: Box::new(file.availability().clone()),
            }
        }
        PreviewSource::Draft { id, draft } => {
            let base = match &id {
                Some(id) => find(caldir, id)?.availability().clone(),
                None => Availability::new(Vec::new()),
            };
            let availability = apply(&base, &draft)?;
            let name = availability
                .summary
                .clone()
                .unwrap_or_else(|| availability.base_slug());
            Resolved::Availability {
                availability: Box::new(availability),
                name,
            }
        }
        PreviewSource::Ranges { ranges, tzid } => Resolved::Ranges {
            ranges: merge(
                ranges
                    .iter()
                    .map(from_span)
                    .collect::<TauResult<Vec<_>>>()?,
            ),
            tz: parse_tz(&tzid)?,
        },
    })
}

impl Resolved {
    /// The zone busy all-day events resolve in, and the default text zone.
    pub(super) fn tz(&self) -> Tz {
        match self {
            Resolved::Availability { availability, .. } => availability
                .tzid()
                .and_then(|tzid| tzid.parse().ok())
                .or_else(|| system_tzid().parse().ok())
                .unwrap_or(chrono_tz::UTC),
            Resolved::Ranges { tz, .. } => *tz,
        }
    }
}

/// Sort and coalesce overlapping or touching intervals.
pub(super) fn merge(mut intervals: Vec<Interval>) -> Vec<Interval> {
    intervals.retain(|interval| !interval.is_empty());
    intervals.sort_by_key(|interval| interval.start);
    let mut merged: Vec<Interval> = Vec::with_capacity(intervals.len());
    for interval in intervals {
        match merged.last_mut() {
            Some(last) if interval.start <= last.end => last.end = last.end.max(interval.end),
            _ => merged.push(interval),
        }
    }
    merged
}

/// Where `a` and `b` overlap. Both merged.
pub(super) fn intersect(a: &[Interval], b: &[Interval]) -> Vec<Interval> {
    merge(
        a.iter()
            .flat_map(|x| b.iter().filter_map(move |y| x.intersect(y)))
            .collect(),
    )
}
