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

A bug whose `fixed_in` names its own driver version is one that driver fixed (it's in that driver's "Fixed Issues" list). Any other bug is a known issue of that driver: fixed later, or still pending.

## GPU launch events

`docs/events.json` lists the drivers that launched new GPUs. The timeline view shades each GPU family's launch period from its first to its last launch driver.

```json
{
    "date": "2025-04-16",
    "driver": "576.02",
    "gpus": ["GeForce RTX 5060 Ti"],
    "family": "RTX 50 series",
    "source": "https://www.nvidia.com/en-us/geforce/news/geforce-rtx-5060-ti-game-ready-driver/"
}
```

Only add a launch that the driver's own release notes announce (e.g. "Game Ready for GeForce RTX 5060 Ti"), and use NVIDIA's announcement for that driver as the `source`. Keep the list sorted by date. If the driver is also in `drivers.json`, the dates must match.

## Checks

CI runs these on every PR. You can run them locally first:

```
python scripts/validate_data.py
python -m unittest discover -s tests
node --test tests/lib.test.js
```

The validator lists every problem it finds, not only the first one. It also warns when the same bug ID shows up under more than one driver. That's not an error, since a bug can come back in a later driver, but it's worth a second look.

The README chart (`docs/assets/bugs-chart-dark.svg`) is regenerated automatically after a merge, so there's no need to update it in your PR.
