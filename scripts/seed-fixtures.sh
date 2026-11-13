#!/usr/bin/env bash
# Seed local-only caldir calendars with edge-case events to check layouts by eye,
# e.g. `scripts/seed-fixtures.sh overlaps "next week"`. Each scenario gets its own
# `fixtures-<scenario>` calendar in the active caldir, emptied and refilled on every run.
set -euo pipefail
shopt -s nullglob

scenarios=(overlaps overnight)
scenario="${1:-all}"
week_of="${2:-today}"

calendar_dir=$(caldir config --json | jq -r .config.calendar_dir)
calendar_dir="${calendar_dir/#\~/$HOME}"

dow=$(date -d "$week_of" +%u)
monday=$(date -d "$week_of -$((dow - 1)) days" +%F)

# Day of the seeded week: 0 = Monday.
day() {
  date -d "$monday +$1 days" +%F
}

calendar=""
calendars=()
declare -A calendar_configs
events=()

# Start queueing a scenario's events into its calendar.
fixture_calendar() {
  calendar="fixtures-$1"
  calendars+=("$calendar")
  calendar_configs[$calendar]=$(printf 'name = "%s"\ncolor = "%s"\nread_only = false' "$2" "$3")
}

# event <title> <day> <start> <end> [end day, if later than <day>]
event() {
  events+=("$calendar"$'\t'"$1"$'\t'"$(day "$2") $3"$'\t'"$(day "${5:-$2}") $4")
}

# all_day <title> <day> [last day, inclusive]
all_day() {
  events+=("$calendar"$'\t'"$1"$'\t'"$(day "$2")"$'\t'"$(day $((${3:-$2} + 1)))")
}

# Overlapping timed events in the week view; titles start with the case number.
seed_overlaps() {
  fixture_calendar overlaps "Fixtures: overlaps" "#e8a33d"

  # Monday
  event "1 · Same time A" 0 09:00 10:00
  event "1 · Same time B" 0 09:00 10:00
  event "2 · Long, same start" 0 14:00 16:30
  event "2 · Short, same start" 0 14:00 15:00

  # Tuesday
  event "3 · Work block" 1 09:00 17:00
  event "3 · Standup" 1 10:00 10:30
  event "3 · Lunch call" 1 13:00 14:00
  event "3 · 1:1" 1 15:30 16:00

  # Wednesday
  event "4 · Workshop" 2 09:00 12:00
  event "4 · Late joiner" 2 11:00 12:30
  event "5 · Starts 14:00" 2 14:00 15:00
  event "5 · Starts 14:05" 2 14:05 15:05
  event "5 · Starts 14:15" 2 14:15 15:00

  # Thursday
  event "6 · Chain A" 3 09:00 10:30
  event "6 · Chain B" 3 10:00 11:30
  event "6 · Chain C" 3 10:45 12:00
  for x in A B C D; do
    event "7 · Four at once $x" 3 14:00 15:00
  done

  # Friday
  event "8 · Back to back 1" 4 09:00 10:00
  event "8 · Back to back 2" 4 10:00 11:00
  event "8 · Back to back 3" 4 11:00 12:00
  event "9 · Short A" 4 13:00 13:15
  event "9 · Short B" 4 13:05 13:20
  event "9 · Short C" 4 13:10 13:30
  event "10 · Group A" 4 15:00 16:00
  event "10 · Group B" 4 15:30 16:30
  event "10 · Separate later" 4 18:00 19:00
}

# Timed events crossing midnight next to all-day ones. Only those covering a whole
# day belong in the all-day lane; titles say where each should be drawn.
seed_overnight() {
  fixture_calendar overnight "Fixtures: overnight" "#3d8be8"

  event "1 · Overnight, timed on Mon + Tue" 0 23:00 01:00 1
  event "2 · Evening to 02:00, timed on Tue + Wed" 1 17:45 02:00 2
  event "3 · Ends at midnight, timed on Wed only" 2 22:00 00:00 3
  event "4 · 25 hours, timed on Wed + Thu" 2 12:00 13:00 3
  event "4 · Next morning, beside 4" 3 09:00 10:00
  event "5 · From midnight, all-day lane" 3 00:00 01:00 4
  all_day "6 · All-day, Thu" 3
  event "7 · Covers Sat, all-day lane" 4 20:00 10:00 6
  event "8 · Overnight, timed on Sat + Sun" 5 23:30 00:30 6
  event "8 · Just after midnight, beside 8" 6 00:00 01:00
  all_day "9 · All-day, Sat to Sun" 5 6
  event "10 · Into next week, timed on Sun + Mon" 6 23:00 01:00 7
}

if [[ "$scenario" == all ]]; then
  selected=("${scenarios[@]}")
elif [[ " ${scenarios[*]} " == *" $scenario "* ]]; then
  selected=("$scenario")
else
  echo "Unknown scenario: $scenario (expected one of: all ${scenarios[*]})" >&2
  exit 1
fi

for s in "${selected[@]}"; do
  "seed_$s"
done

echo "Seeding fixtures for the week of $(date -d "$monday" '+%a %-d %b %Y'):"
for cal in "${calendars[@]}"; do
  dir="$calendar_dir/$cal"
  if grep -qs '^\[remote\]' "$dir/.caldir/config.toml"; then
    echo "Refusing to replace ${dir/#$HOME/\~}: it syncs to a remote" >&2
    exit 1
  fi
  count=$(printf '%s\n' "${events[@]}" | grep -c "^$cal"$'\t')
  existing_files=("$dir"/*.ics)
  existing=${#existing_files[@]}
  if ((existing)); then
    echo "  ${dir/#$HOME/\~}: $count events, replacing its $existing existing ones"
  else
    echo "  ${dir/#$HOME/\~}: $count events in a new calendar"
  fi
done
echo "These calendars have no remote, so nothing is synced."
read -rp "Continue? [y/N] " answer || true
if [[ "$answer" != [yY] ]]; then
  echo "Aborted"
  exit 0
fi

for cal in "${calendars[@]}"; do
  dir="$calendar_dir/$cal"
  rm -rf "$dir"
  mkdir -p "$dir/.caldir"
  printf '%s\n' "${calendar_configs[$cal]}" >"$dir/.caldir/config.toml"
done

for entry in "${events[@]}"; do
  IFS=$'\t' read -r cal title start end <<<"$entry"
  caldir new "$title" -s "$start" -e "$end" -C "$cal" --no-reminders >/dev/null
done
echo "Seeded ${#events[@]} events"
