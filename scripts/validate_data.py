#!/usr/bin/env python3
"""
Check docs/drivers.json and docs/events.json against the format the site and
the chart expect. Unknown keys are rejected too, so a typo like "fixed" for
"fixed_in" fails instead of being silently ignored.

Usage:
    python scripts/validate_data.py [path/to/drivers.json] [--events path/to/events.json]
"""
import json
import re
import sys
import argparse
from datetime import date
from pathlib import Path

# Always two decimals: "581.80", not "581.8".
VERSION_REGEX = re.compile(r"^\d+\.\d{2}$")

# NVIDIA bug IDs such as "3829994" or "200633408", stored as strings.
BUG_ID_REGEX = re.compile(r"^\d{6,}$")

# "[3829994]" or "[3830387/3739997]" left in a description instead of "ids".
ID_IN_DESCRIPTION_REGEX = re.compile(r"\[\s*\d{6,}(?:\s*/\s*\d{6,})*\s*\]")

DRIVER_CHANNELS = {"game-ready", "studio"}


def is_real_date(value):
    """True for a real calendar date written as YYYY-MM-DD."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def validate_data(filepath):
    """
    Print every problem found in `filepath` (not just the first) and return
    True only if the file is valid. Bug IDs repeated across entries are
    reported as warnings, since a regression legitimately reuses an ID.
    """
    path = Path(filepath)
    if not path.exists():
        print(f"Error: File '{filepath}' does not exist.")
        return False

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON syntax in '{filepath}': {e}")
        return False
    except Exception as e:
        print(f"Error reading '{filepath}': {e}")
        return False

    if not isinstance(data, list):
        print(f"Error: Root element in '{filepath}' must be a JSON array [].")
        return False

    seen_versions = set()
    id_occurrences = {}  # bug ID -> [(driver version, fixed_in), ...]
    has_errors = False

    for idx, entry in enumerate(data):
        location = f"Entry {idx}"
        if isinstance(entry, dict) and "version" in entry:
            location += f" (Version: {entry['version']})"

        if not isinstance(entry, dict):
            print(f"Error at {location}: Entry must be an object/dict.")
            has_errors = True
            continue

        allowed_entry_keys = {"version", "bugs", "channels", "release_date", "release_notes", "feedback_thread", "reddit_thread", "still_open"}
        extra_keys = set(entry.keys()) - allowed_entry_keys
        if extra_keys:
            print(f"Error at {location}: Contains unexpected key(s): {', '.join(sorted(extra_keys))}")
            has_errors = True

        version = entry.get("version")
        if version is None:
            print(f"Error at {location}: Missing required field 'version'.")
            has_errors = True
        elif not isinstance(version, str):
            print(f"Error at {location}: 'version' must be a string.")
            has_errors = True
        else:
            if not VERSION_REGEX.match(version):
                print(f"Error at {location}: 'version' '{version}' is invalid. Must be digits with exactly 2 decimal places (e.g. '581.80').")
                has_errors = True

            if version in seen_versions:
                print(f"Error at {location}: Duplicate version '{version}' detected.")
                has_errors = True
            else:
                seen_versions.add(version)

        if "channels" in entry:
            channels = entry["channels"]
            if (not isinstance(channels, list) or not channels
                    or any(c not in DRIVER_CHANNELS for c in channels)
                    or len(set(channels)) != len(channels)):
                print(f"Error at {location}: 'channels' must be a non-empty list of unique values from: {', '.join(sorted(DRIVER_CHANNELS))}.")
                has_errors = True

        if "release_date" in entry:
            if not is_real_date(entry["release_date"]):
                print(f"Error at {location}: 'release_date' must be a real date formatted YYYY-MM-DD.")
                has_errors = True

        for link in ("release_notes", "feedback_thread", "reddit_thread"):
            if link in entry and (not isinstance(entry[link], str) or not entry[link].startswith("https://")):
                print(f"Error at {location}: '{link}' must be an https:// URL.")
                has_errors = True

        if "still_open" in entry:
            still_open = entry["still_open"]
            if (not isinstance(still_open, list) or not still_open
                    or not all(isinstance(i, str) and BUG_ID_REGEX.match(i) for i in still_open)
                    or len(set(still_open)) != len(still_open)):
                print(f"Error at {location}: 'still_open' must be a non-empty list of unique bug IDs (e.g. [\"6007998\"]).")
                has_errors = True

        bugs = entry.get("bugs")
        if bugs is None:
            print(f"Error at {location}: Missing required field 'bugs'.")
            has_errors = True
        elif not isinstance(bugs, list):
            print(f"Error at {location}: 'bugs' field must be an array.")
            has_errors = True
        else:
            for b_idx, bug in enumerate(bugs):
                bug_location = f"{location}, Bug index {b_idx}"
                if not isinstance(bug, dict):
                    print(f"Error at {bug_location}: Bug item must be an object.")
                    has_errors = True
                    continue

                allowed_bug_keys = {"description", "ids", "fixed_in"}
                extra_bug_keys = set(bug.keys()) - allowed_bug_keys
                if extra_bug_keys:
                    print(f"Error at {bug_location}: Contains unexpected key(s): {', '.join(sorted(extra_bug_keys))}")
                    has_errors = True

                if "description" not in bug:
                    print(f"Error at {bug_location}: Missing required field 'description'.")
                    has_errors = True
                elif not isinstance(bug["description"], str) or not bug["description"].strip():
                    print(f"Error at {bug_location}: 'description' must be a non-empty string.")
                    has_errors = True
                elif ID_IN_DESCRIPTION_REGEX.search(bug["description"]):
                    print(f"Error at {bug_location}: 'description' contains a bug ID in brackets, move it to 'ids'.")
                    has_errors = True

                if "ids" not in bug:
                    print(f"Error at {bug_location}: Missing required field 'ids' (use [] if the bug has no ID).")
                    has_errors = True
                else:
                    ids = bug["ids"]
                    if not isinstance(ids, list) or not all(isinstance(i, str) and BUG_ID_REGEX.match(i) for i in ids):
                        print(f"Error at {bug_location}: 'ids' must be a list of digit-only strings (e.g. [\"3829994\"]).")
                        has_errors = True
                    elif len(set(ids)) != len(ids):
                        print(f"Error at {bug_location}: 'ids' contains the same ID more than once.")
                        has_errors = True
                    elif isinstance(version, str):
                        for bug_id in ids:
                            id_occurrences.setdefault(bug_id, []).append((version, bug.get("fixed_in")))

                # null means pending. "Fixed (<this entry's version>)" means
                # this driver fixed it.
                if "fixed_in" not in bug:
                    print(f"Error at {bug_location}: Missing required field 'fixed_in'.")
                    has_errors = True
                else:
                    fixed_in = bug["fixed_in"]
                    if fixed_in is not None and not isinstance(fixed_in, str):
                        print(f"Error at {bug_location}: 'fixed_in' must be a string or null.")
                        has_errors = True

    if not has_errors and not check_still_open(data):
        has_errors = True

    for bug_id, occurrences in sorted(id_occurrences.items()):
        if len(occurrences) > 1:
            where = "; ".join(f"{v} ({fixed_in or 'Pending'})" for v, fixed_in in occurrences)
            print(f"Warning: Bug ID {bug_id} appears in more than one entry: {where}")

    if has_errors:
        return False

    print(f"Validation successful! '{filepath}' is valid. Checked {len(data)} driver versions.")
    return True


def version_key(version):
    return tuple(int(p) for p in version.split("."))


def check_still_open(data):
    """
    'still_open' lists IDs NVIDIA repeated as open issues in a driver after an
    earlier driver listed them. Each ID must belong to an earlier entry, not to
    this driver's own bugs, and that entry can't say it was fixed by now.
    """
    ok = True
    for entry in data:
        version = entry["version"]
        own = {i for bug in entry["bugs"] for i in bug["ids"]}
        for bug_id in entry.get("still_open", []):
            location = f"Version {version}, still_open {bug_id}"
            if bug_id in own:
                print(f"Error at {location}: this driver already has an entry with that ID.")
                ok = False
                continue
            earlier = [(d["version"], bug) for d in data if version_key(d["version"]) < version_key(version)
                       for bug in d["bugs"] if bug_id in bug["ids"]]
            if not earlier:
                print(f"Error at {location}: no earlier driver lists that ID.")
                ok = False
                continue
            listed_in, bug = max(earlier, key=lambda e: version_key(e[0]))
            m = re.fullmatch(r"Fixed \((\d+\.\d{2})\)", bug["fixed_in"] or "")
            if m and version_key(m.group(1)) <= version_key(version):
                print(f"Error at {location}: {listed_in} says it was {bug['fixed_in']}, so it can't still be open here.")
                ok = False
    return ok


def validate_events(filepath, drivers_filepath):
    """
    Check the GPU launch events drawn on the timeline. Each event names the
    driver that added support for new GPUs. When that driver is also in
    drivers.json, both dates must match.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            events = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Error reading '{filepath}': {e}")
        return False
    try:
        with open(drivers_filepath, "r", encoding="utf-8") as f:
            release_dates = {d.get("version"): d.get("release_date") for d in json.load(f) if isinstance(d, dict)}
    except (OSError, json.JSONDecodeError):
        release_dates = {}

    if not isinstance(events, list):
        print(f"Error: Root element in '{filepath}' must be a JSON array [].")
        return False

    has_errors = False
    seen_gpus = set()
    previous_date = None
    for idx, event in enumerate(events):
        location = f"Event {idx}"
        if not isinstance(event, dict):
            print(f"Error at {location}: Event must be an object.")
            has_errors = True
            continue

        expected = {"date", "driver", "gpus", "family", "source"}
        if set(event) != expected:
            missing = expected - set(event)
            extra = set(event) - expected
            if missing:
                print(f"Error at {location}: Missing field(s): {', '.join(sorted(missing))}")
            if extra:
                print(f"Error at {location}: Contains unexpected key(s): {', '.join(sorted(extra))}")
            has_errors = True
            continue

        if not is_real_date(event["date"]):
            print(f"Error at {location}: 'date' must be a real date formatted YYYY-MM-DD.")
            has_errors = True
        elif previous_date and event["date"] < previous_date:
            print(f"Error at {location}: Events must be sorted by date.")
            has_errors = True
        else:
            previous_date = event["date"]

        driver = event["driver"]
        if not isinstance(driver, str) or not VERSION_REGEX.match(driver):
            print(f"Error at {location}: 'driver' must be a version like '581.80'.")
            has_errors = True
        elif driver in release_dates and release_dates[driver] and release_dates[driver] != event["date"]:
            print(f"Error at {location}: 'date' {event['date']} doesn't match driver {driver}'s release_date {release_dates[driver]}.")
            has_errors = True

        gpus = event["gpus"]
        if not isinstance(gpus, list) or not gpus or not all(isinstance(g, str) and g.strip() for g in gpus):
            print(f"Error at {location}: 'gpus' must be a non-empty list of GPU names.")
            has_errors = True
        else:
            for gpu in gpus:
                if gpu in seen_gpus:
                    print(f"Error at {location}: '{gpu}' already appears in an earlier event.")
                    has_errors = True
                seen_gpus.add(gpu)

        if not isinstance(event["family"], str) or not event["family"].strip():
            print(f"Error at {location}: 'family' must be a non-empty string.")
            has_errors = True

        if not isinstance(event["source"], str) or not event["source"].startswith("https://"):
            print(f"Error at {location}: 'source' must be an https:// URL.")
            has_errors = True

    if has_errors:
        return False

    print(f"Validation successful! '{filepath}' is valid. Checked {len(events)} events.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Validate drivers.json and events.json.")
    parser.add_argument("file", nargs="?", default="docs/drivers.json", help="Path to drivers.json (default: docs/drivers.json)")
    parser.add_argument("--events", default=None, help="Path to events.json (default: events.json next to drivers.json, if it exists)")
    args = parser.parse_args()

    success = validate_data(args.file)
    events_path = Path(args.events) if args.events else Path(args.file).with_name("events.json")
    if args.events or events_path.exists():
        success = validate_events(events_path, args.file) and success
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
