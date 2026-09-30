# Contributing

Bug reports, missing issues and corrections are all welcome. The easiest way is to [open an issue](https://github.com/indep-arg/NvidiaWatch/issues/new/choose). If you'd rather edit the data yourself, send a PR that changes `docs/drivers.json`.

Please only add information you can point to in an official NVIDIA source: the driver's release notes, its download page, or NVIDIA's own posts.

## Data format

`docs/drivers.json` is a list of drivers, one entry per version. For example (trimmed to one bug):

```json
{
    "version": "581.80",
    "channels": ["game-ready"],
    "release_date": "2025-11-04",
    "release_notes": "https://us.download.nvidia.com/Windows/581.80/581.80-win11-win10-release-notes.pdf",
    "bugs": [
        {
            "description": "F1 25: Performance optimizations when using DLSS Frame Generation",
            "ids": ["5422722"],
            "fixed_in": "Fixed (581.80)"
        }
    ]
}
```

| Field | Required | Notes |
|---|---|---|
| `version` | yes | Always two decimals: `581.80`, not `581.8`. |
| `channels` | no | `game-ready` and/or `studio`. Many versions ship in both. |
| `release_date` | no | `YYYY-MM-DD`, the Game Ready release date from NVIDIA's download page. |
| `release_notes` | no | Link to the official release notes PDF. |
| `bugs` | yes | List of bugs, can be empty. |
| `description` | yes | What goes wrong. Don't include the bug ID here. |
| `ids` | yes | NVIDIA bug IDs as strings, e.g. `["4103923", "4343427"]`. Use `[]` if there is none. |
| `fixed_in` | yes | `null` while pending, otherwise usually `"Fixed (X.YY)"`. |

A bug whose `fixed_in` names its own driver version counts as fixed in the same release. Any other fix counts as fixed later.

## Checks

CI runs these on every PR. You can run them locally first:

```
python scripts/validate_data.py
python -m unittest discover -s tests
node --test tests/lib.test.js
```

The validator lists every problem it finds, not only the first one. It also warns when the same bug ID shows up under more than one driver. That's not an error, since a bug can come back in a later driver, but it's worth a second look.

The README chart (`docs/assets/bugs-chart-dark.svg`) is regenerated automatically after a merge, so there's no need to update it in your PR.
