"""Tests for scripts/generate_chart.py."""
import json
import os
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import generate_chart as gc

SVG_NS = "{http://www.w3.org/2000/svg}"


def real_data():
    with open(Path(__file__).parent.parent / "docs" / "drivers.json", encoding="utf-8") as f:
        return json.load(f)


# Totals counted straight from the file, the same way tests/lib.test.js does.
def fix_total(data):
    versions = {d["version"] for d in data}
    return sum(1 for d in data for b in d["bugs"]
               if (b["fixed_in"] or "").startswith("Fixed (") and b["fixed_in"][7:-1] in versions)


def known_total(data):
    return sum(sum(1 for b in d["bugs"] if gc.bug_status(b, d["version"]) != "fixed") + len(d.get("still_open", []))
               for d in data)


def bug(fixed_in):
    return {"description": "Test bug", "ids": [], "fixed_in": fixed_in}


class TestBugStatus(unittest.TestCase):
    def test_pending(self):
        self.assertEqual(gc.bug_status(bug(None), "581.80"), "pending")

    def test_fixed_in_same_release(self):
        self.assertEqual(gc.bug_status(bug("Fixed (581.80)"), "581.80"), "fixed")

    def test_fixed_later(self):
        self.assertEqual(gc.bug_status(bug("Fixed (581.94)"), "581.80"), "fixed_later")
        self.assertEqual(gc.bug_status(bug("Fixed External"), "581.80"), "fixed_later")
        self.assertEqual(gc.bug_status(bug("Fixed (OTA profile update)"), "581.80"), "fixed_later")

    def test_shared_cases(self):
        # Same cases as tests/lib.test.js, so the site and the chart can't disagree.
        cases = json.loads((Path(__file__).parent / "status_cases.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case):
                expected = case["status"].replace("-", "_")
                self.assertEqual(gc.bug_status(bug(case["fixed_in"]), case["version"]), expected)


class TestCeilTo(unittest.TestCase):
    def test_rounds_up_to_step(self):
        self.assertEqual(gc.ceil_to(0, 5), 5)
        self.assertEqual(gc.ceil_to(5, 5), 5)
        self.assertEqual(gc.ceil_to(16, 5), 20)
        self.assertEqual(gc.ceil_to(23, 5), 25)


class TestLoadSeries(unittest.TestCase):
    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump([
                {"version": "581.94", "bugs": [bug(None)]},
                {"version": "581.80", "bugs": [bug("Fixed (581.80)"), bug("Fixed (581.94)"), bug(None)]},
                {"version": "581.9", "bugs": []},
            ], f)

    def tearDown(self):
        os.remove(self.path)

    def test_sorted_numerically_and_counted(self):
        series = gc.load_series(self.path)
        self.assertEqual([s["version"] for s in series], ["581.9", "581.80", "581.94"])
        self.assertEqual(series[1], {"version": "581.80", "known": 2, "fixed_later": 1, "pending": 1, "fixed": 1})


class TestEarlierFixes(unittest.TestCase):
    def test_counted_under_the_driver_that_fixed_them(self):
        drivers = [
            {"version": "581.80", "bugs": [
                {"description": "Flicker", "ids": ["1"], "fixed_in": "Fixed (581.94)"},
                {"description": "Crash", "ids": ["2"], "fixed_in": "Fixed (581.94)"},
                {"description": "Hang", "ids": [], "fixed_in": "Fixed (590.00)"},
                {"description": "Profile", "ids": ["3"], "fixed_in": "Fixed (OTA profile update)"},
            ]},
            # 581.94 already lists bug 2, so only bug 1 is added.
            {"version": "581.94", "bugs": [{"description": "Crash", "ids": ["2"], "fixed_in": "Fixed (581.94)"}]},
        ]
        self.assertEqual(gc.earlier_fixes(drivers), {"581.94": 1})

    def test_matches_lib_js_on_real_data(self):
        series = {s["version"]: s for s in gc.load_series()}
        self.assertEqual(series["616.92"]["fixed"], 3)
        self.assertEqual(sum(s["fixed"] for s in series.values()), fix_total(real_data()))


class TestBuildSvg(unittest.TestCase):
    def test_empty_series_renders_placeholder(self):
        svg = gc.build_svg([], "dark")
        root = ET.fromstring(svg)
        self.assertIn("No driver data yet", "".join(root.itertext()))

    def test_one_group_per_driver_with_title(self):
        series = [
            {"version": "581.80", "known": 2, "fixed_later": 1, "pending": 1, "fixed": 1},
            {"version": "581.94", "known": 0, "fixed_later": 0, "pending": 0, "fixed": 0},
        ]
        root = ET.fromstring(gc.build_svg(series, "dark"))
        groups = root.findall(f"{SVG_NS}g")
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0][0].tag, f"{SVG_NS}title")
        self.assertEqual(len(groups[0].findall(f"{SVG_NS}rect")), 3)
        self.assertEqual(len(groups[1].findall(f"{SVG_NS}rect")), 0)

    def test_known_issues_above_and_fixes_below_the_baseline(self):
        series = [{"version": "581.80", "known": 3, "fixed_later": 2, "pending": 1, "fixed": 4}]
        root = ET.fromstring(gc.build_svg(series, "dark"))
        rects = root.find(f"{SVG_NS}g").findall(f"{SVG_NS}rect")
        colors = {r.get("fill"): r for r in rects}
        base = next(float(l.get("y1")) for l in root.findall(f"{SVG_NS}line") if l.get("stroke") == gc.THEMES["dark"]["border"])
        fixed = colors[gc.THEMES["dark"]["fixed"]]
        later = colors[gc.THEMES["dark"]["fixed_later"]]
        pending = colors[gc.THEMES["dark"]["pending"]]
        self.assertGreater(float(fixed.get("y")), base)
        self.assertLess(float(later.get("y")) + float(later.get("height")), base)
        self.assertLess(float(pending.get("y")), float(later.get("y")))
        self.assertIn("most known issues (3)", "".join(root.itertext()))

    def test_real_data_renders_valid_svg(self):
        ET.fromstring(gc.build_svg(gc.load_series(), "dark"))



class TestRelisted(unittest.TestCase):
    def test_repeated_open_issues_count_as_known(self):
        drivers = [
            {"version": "610.47", "bugs": [{"description": "Power mode", "ids": ["1"], "fixed_in": None}]},
            {"version": "610.62", "bugs": [{"description": "Crash", "ids": ["2"], "fixed_in": "Fixed (617.14)"}], "still_open": ["1"]},
            {"version": "616.92", "bugs": [], "still_open": ["1", "2"]},
        ]
        self.assertEqual(gc.relisted_statuses(drivers, drivers[2]), ["pending", "fixed_later"])
        self.assertEqual(gc.relisted_statuses(drivers, drivers[0]), [])

    def test_matches_lib_js_on_real_data(self):
        series = {s["version"]: s for s in gc.load_series()}
        self.assertEqual(series["617.14"]["known"], 2)
        self.assertEqual(sum(s["known"] for s in series.values()), known_total(real_data()))


if __name__ == "__main__":
    unittest.main()
