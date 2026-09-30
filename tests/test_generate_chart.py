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


class TestNiceCeil(unittest.TestCase):
    def test_rounds_up_to_1_2_5(self):
        self.assertEqual(gc.nice_ceil(0), 1)
        self.assertEqual(gc.nice_ceil(7), 10)
        self.assertEqual(gc.nice_ceil(12), 20)
        self.assertEqual(gc.nice_ceil(39.1), 50)
        self.assertEqual(gc.nice_ceil(50), 50)


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
        self.assertEqual(series[1], {"version": "581.80", "total": 3, "fixed": 1, "fixed_later": 1, "pending": 1})


class TestBuildSvg(unittest.TestCase):
    def test_empty_series_renders_placeholder(self):
        svg = gc.build_svg([], "dark")
        root = ET.fromstring(svg)
        self.assertIn("No driver data yet", "".join(root.itertext()))

    def test_one_group_per_driver_with_title(self):
        series = [
            {"version": "581.80", "total": 3, "fixed": 1, "fixed_later": 1, "pending": 1},
            {"version": "581.94", "total": 0, "fixed": 0, "fixed_later": 0, "pending": 0},
        ]
        root = ET.fromstring(gc.build_svg(series, "dark"))
        groups = root.findall(f"{SVG_NS}g")
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0][0].tag, f"{SVG_NS}title")
        self.assertEqual(len(groups[0].findall(f"{SVG_NS}rect")), 3)
        self.assertEqual(len(groups[1].findall(f"{SVG_NS}rect")), 0)

    def test_real_data_renders_valid_svg(self):
        ET.fromstring(gc.build_svg(gc.load_series(), "dark"))


if __name__ == "__main__":
    unittest.main()
