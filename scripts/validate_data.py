#!/usr/bin/env python3
"""
Check docs/drivers.json against the format the site and the chart expect.
Unknown keys are rejected too, so a typo like "fixed" for "fixed_in" fails
instead of being silently ignored.

Usage:
    python scripts/validate_data.py [path/to/drivers.json]
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

        allowed_entry_keys = {"version", "bugs", "channels", "release_date", "release_notes"}
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
            release_date = entry["release_date"]
            valid_date = isinstance(release_date, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", release_date)
            if valid_date:
                try:
                    date.fromisoformat(release_date)
                except ValueError:
                    valid_date = False
            if not valid_date:
                print(f"Error at {location}: 'release_date' must be a real date formatted YYYY-MM-DD.")
                has_errors = True

        if "release_notes" in entry:
            release_notes = entry["release_notes"]
            if not isinstance(release_notes, str) or not release_notes.startswith("https://"):
                print(f"Error at {location}: 'release_notes' must be an https:// URL.")
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

    for bug_id, occurrences in sorted(id_occurrences.items()):
        if len(occurrences) > 1:
            where = "; ".join(f"{v} ({fixed_in or 'Pending'})" for v, fixed_in in occurrences)
            print(f"Warning: Bug ID {bug_id} appears in more than one entry: {where}")

    if has_errors:
        return False

    print(f"Validation successful! '{filepath}' is valid. Checked {len(data)} driver versions.")
    return True


def main():
    parser = argparse.ArgumentParser(description="Validate drivers.json structure and formatting.")
    parser.add_argument("file", nargs="?", default="docs/drivers.json", help="Path to drivers.json file to validate (default: docs/drivers.json)")
    args = parser.parse_args()

    success = validate_data(args.file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
