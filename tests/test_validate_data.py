"""Tests for scripts/validate_data.py."""
import unittest
import json
import tempfile
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from validate_data import validate_data

class TestValidateData(unittest.TestCase):
    def setUp(self):
        self.temp_files = []

    def tearDown(self):
        for filepath in self.temp_files:
            if os.path.exists(filepath):
                os.remove(filepath)

    def _create_temp_json(self, content):
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            if isinstance(content, str):
                f.write(content)
            else:
                json.dump(content, f)
        self.temp_files.append(path)
        return path

    def test_valid_data_file(self):
        valid_json = [
            {
                "version": "581.80",
                "bugs": [
                    {
                        "description": "F1 25: Performance optimizations when using DLSS Frame Generation",
                        "ids": ["5422722"],
                        "fixed_in": "Fixed (581.80)"
                    },
                    {
                        "description": "Vulkan apps crash when launched on Core 2 Duo / Core 2 Quad CPUs",
                        "ids": ["5509161", "5509162"],
                        "fixed_in": None
                    }
                ]
            }
        ]
        path = self._create_temp_json(valid_json)
        self.assertTrue(validate_data(path))

    # Runs against the real data file, not a fixture.
    def test_actual_docs_data_json(self):
        docs_data_path = Path(__file__).parent.parent / "docs" / "drivers.json"
        self.assertTrue(validate_data(docs_data_path))

    def test_invalid_json_syntax(self):
        path = self._create_temp_json("[{ invalid json")
        self.assertFalse(validate_data(path))

    def test_non_list_root(self):
        path = self._create_temp_json({"version": "581.80", "bugs": []})
        self.assertFalse(validate_data(path))

    def test_missing_version(self):
        data = [{"bugs": []}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_invalid_version_format(self):
        data = [{"version": "581.8", "bugs": []}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

        data_letters = [{"version": "581.80a", "bugs": []}]
        path_letters = self._create_temp_json(data_letters)
        self.assertFalse(validate_data(path_letters))

    def test_duplicate_version(self):
        data = [
            {"version": "581.80", "bugs": []},
            {"version": "581.80", "bugs": []}
        ]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_missing_bugs(self):
        data = [{"version": "581.80"}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_invalid_bug_structure(self):
        # Bug missing description
        data1 = [{"version": "581.80", "bugs": [{"ids": [], "fixed_in": None}]}]
        path1 = self._create_temp_json(data1)
        self.assertFalse(validate_data(path1))

        # Empty description
        data2 = [{"version": "581.80", "bugs": [{"description": "   ", "ids": [], "fixed_in": None}]}]
        path2 = self._create_temp_json(data2)
        self.assertFalse(validate_data(path2))

        # fixed_in must be a string or null
        data3 = [{"version": "581.80", "bugs": [{"description": "Test bug", "ids": [], "fixed_in": 123}]}]
        path3 = self._create_temp_json(data3)
        self.assertFalse(validate_data(path3))

    def test_bug_ids(self):
        def bug(**overrides):
            b = {"description": "Test bug", "ids": ["3829994"], "fixed_in": None}
            b.update(overrides)
            return [{"version": "581.80", "bugs": [b]}]

        # An empty list is fine, a missing key is not.
        self.assertTrue(validate_data(self._create_temp_json(bug(ids=[]))))
        no_ids = bug()
        del no_ids[0]["bugs"][0]["ids"]
        self.assertFalse(validate_data(self._create_temp_json(no_ids)))
        self.assertFalse(validate_data(self._create_temp_json(bug(ids=[3829994]))))
        self.assertFalse(validate_data(self._create_temp_json(bug(ids=["abc123"]))))
        self.assertFalse(validate_data(self._create_temp_json(bug(ids="3829994"))))
        self.assertFalse(validate_data(self._create_temp_json(bug(ids=["3829994", "3829994"]))))
        self.assertFalse(validate_data(self._create_temp_json(bug(description="Crash [3829994]"))))
        self.assertFalse(validate_data(self._create_temp_json(bug(description="Crash [3830387/3739997]"))))
        # Brackets that aren't IDs are fine.
        self.assertTrue(validate_data(self._create_temp_json(bug(description="[Cyberpunk 2077] Crash [RELATED WITH 4362644]"))))

    def test_duplicate_bug_ids_warn_but_pass(self):
        data = [
            {"version": "555.99", "bugs": [{"description": "Overlay stops refreshing", "ids": ["4679970"], "fixed_in": "Fixed (561.09)"}]},
            {"version": "560.94", "bugs": [{"description": "Overlay stops refreshing", "ids": ["4679970"], "fixed_in": None}]},
        ]
        self.assertTrue(validate_data(self._create_temp_json(data)))

    def test_optional_driver_metadata(self):
        def entry(**extra):
            e = {"version": "581.80", "bugs": []}
            e.update(extra)
            return [e]

        valid = entry(
            channels=["game-ready", "studio"],
            release_date="2025-01-01",
            release_notes="https://example.com/release-notes.pdf",
        )
        self.assertTrue(validate_data(self._create_temp_json(valid)))

        self.assertFalse(validate_data(self._create_temp_json(entry(channels=[]))))
        self.assertFalse(validate_data(self._create_temp_json(entry(channels=["beta"]))))
        self.assertFalse(validate_data(self._create_temp_json(entry(channels="game-ready"))))
        self.assertFalse(validate_data(self._create_temp_json(entry(channels=["studio", "studio"]))))
        self.assertFalse(validate_data(self._create_temp_json(entry(release_date="2025-13-01"))))
        self.assertFalse(validate_data(self._create_temp_json(entry(release_date="04/11/2025"))))
        self.assertFalse(validate_data(self._create_temp_json(entry(release_notes="http://example.com"))))

    def test_unexpected_keys(self):
        data = [{"version": "581.80", "bugs": [], "extra_key": "val"}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

if __name__ == "__main__":
    unittest.main()
