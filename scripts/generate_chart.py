#!/usr/bin/env python3
"""
Draw the "Bugs by driver" chart from docs/drivers.json as a static SVG for
the README. Colors match the dark theme in docs/style.css.

Usage:
    python scripts/generate_chart.py
"""
import json
import math
import re
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_PATH = REPO_ROOT / "docs" / "drivers.json"
OUTPUT_DIR = REPO_ROOT / "docs" / "assets"
SITE_URL = "https://indep-arg.github.io/NvidiaWatch/?view=trends"

THEMES = {
    "dark": {
        "bg": "#18191c",
        "border": "#3a3d42",
        "text_primary": "#ecebe7",
        "text_secondary": "#a2a3a7",
        "accent": "#8fb4ff",
        "fixed": "#2fb58f",
        "fixed_later": "#e69f00",
        "pending": "#e8703a",
        "grid": "#2a2c30",
    },
}

FONT_DISPLAY = "'IBM Plex Sans', 'Segoe UI', sans-serif"
FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace"

WIDTH, HEIGHT = 1200, 400
PAD_LEFT, PAD_RIGHT = 44, 24
PAD_TOP, PAD_BOTTOM = 76, 62
BAR_GAP = 3
SEGMENT_GAP = 2
VERSION_LABELS = 6


def version_key(v):
    return tuple(int(p) for p in v.split("."))


def ceil_to(value, step):
    """Round up to the next multiple of `step`, never below `step`."""
    return max(step, math.ceil(value / step) * step)


def bug_status(bug, version):
    """Same rule as bugStatus() in docs/lib.js."""
    fixed_in = bug.get("fixed_in")
    if fixed_in is None:
        return "pending"
    if fixed_in == f"Fixed ({version})":
        return "fixed"
    return "fixed_later"


def fixed_in_version(bug):
    m = re.fullmatch(r"Fixed \((\d+\.\d{2})\)", bug.get("fixed_in") or "")
    return m.group(1) if m else None


def earlier_fixes(drivers):
    """Same rule as withEarlierFixes() in docs/lib.js: how many known issues
    of earlier drivers each driver fixed, leaving out bugs it already lists."""
    counts = {}
    seen = {}
    for d in drivers:
        ids, texts = set(), set()
        for b in d["bugs"]:
            ids.update(b.get("ids") or [])
            texts.add(b["description"].lower())
        seen[d["version"]] = (ids, texts)
    for d in drivers:
        for b in d["bugs"]:
            to = fixed_in_version(b)
            if not to or to == d["version"] or to not in seen:
                continue
            ids, texts = seen[to]
            bug_ids = b.get("ids") or []
            if (any(i in ids for i in bug_ids) if bug_ids else b["description"].lower() in texts):
                continue
            ids.update(bug_ids)
            texts.add(b["description"].lower())
            counts[to] = counts.get(to, 0) + 1
    return counts


def relisted_statuses(drivers, driver):
    """Same rule as withRelisted() in docs/lib.js: the status of each open
    issue a driver repeated, taken from the latest earlier entry with that ID."""
    statuses = []
    for bug_id in driver.get("still_open", []):
        earlier = [(d["version"], b) for d in drivers if version_key(d["version"]) < version_key(driver["version"])
                   for b in d["bugs"] if bug_id in (b.get("ids") or [])]
        if earlier:
            _, bug = max(earlier, key=lambda e: version_key(e[0]))
            statuses.append(bug_status(bug, driver["version"]))
    return statuses


def load_series(path=DATA_PATH):
    with open(path, encoding="utf-8") as f:
        drivers = json.load(f)
    drivers = sorted(drivers, key=lambda d: version_key(d["version"]))
    extra = earlier_fixes(drivers)
    series = []
    for d in drivers:
        statuses = [bug_status(b, d["version"]) for b in d["bugs"]] + relisted_statuses(drivers, d)
        fixed_later = statuses.count("fixed_later")
        pending = statuses.count("pending")
        series.append({
            "version": d["version"],
            "known": fixed_later + pending,
            "fixed_later": fixed_later,
            "pending": pending,
            "fixed": statuses.count("fixed") + extra.get(d["version"], 0),
        })
    return series


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def build_svg(series, theme_name):
    """Known issues go up from the baseline, bugs fixed by the driver go down."""
    t = THEMES[theme_name]
    n = len(series)
    plot_x0, plot_x1 = PAD_LEFT, WIDTH - PAD_RIGHT
    plot_y0, plot_y1 = PAD_TOP, HEIGHT - PAD_BOTTOM
    plot_w = plot_x1 - plot_x0
    plot_h = plot_y1 - plot_y0
    mono = f'font-family="{FONT_MONO}"'

    header = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="{WIDTH}" height="{HEIGHT}" role="img" '
        f'aria-label="Bugs by driver: known issues above the line, bugs fixed in that driver below it">',
        f'<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" rx="14" fill="{t["bg"]}" stroke="{t["border"]}"/>',
        f'<text x="{PAD_LEFT}" y="34" font-family="{FONT_DISPLAY}" font-weight="600" '
        f'font-size="20" fill="{t["text_primary"]}">Bugs by driver</text>',
    ]

    if n == 0:
        return "\n".join(header + [
            f'<text x="{WIDTH / 2:.1f}" y="{HEIGHT / 2:.1f}" text-anchor="middle" {mono} '
            f'font-size="14" fill="{t["text_secondary"]}">No driver data yet</text>',
            "</svg>",
        ])

    # One scale for both directions, each side rounded up to a multiple of 5.
    up_max = ceil_to(max(item["known"] for item in series), 5)
    down_max = ceil_to(max(item["fixed"] for item in series), 5)
    unit = plot_h / (up_max + down_max)
    base_y = plot_y0 + up_max * unit

    bar_w = max(1.5, (plot_w - BAR_GAP * (n - 1)) / n)

    def bar_x(i):
        return plot_x0 + i * (bar_w + BAR_GAP)

    parts = list(header)
    first_v, last_v = series[0]["version"], series[-1]["version"]
    peak = max(series, key=lambda item: item["known"])
    # The busiest driver goes in the subtitle, not over the bars.
    parts.append(
        f'<text x="{PAD_LEFT}" y="56" {mono} font-size="12" fill="{t["text_secondary"]}">'
        f'{n} driver versions &#183; {esc(first_v)} &#8594; {esc(last_v)} &#183; '
        f'<tspan fill="{t["accent"]}">{esc(peak["version"])} had the most known issues ({peak["known"]})</tspan></text>'
    )
    parts.append(
        f'<text x="{plot_x1}" y="34" text-anchor="end" {mono} font-size="12" fill="{t["text_secondary"]}">'
        f'Known issues: <tspan fill="{t["fixed_later"]}">&#9679;</tspan> Fixed later &#160;'
        f'<tspan fill="{t["pending"]}">&#9679;</tspan> Still open</text>'
    )
    parts.append(
        f'<text x="{plot_x1}" y="56" text-anchor="end" {mono} font-size="12" fill="{t["text_secondary"]}">'
        f'Below the line: <tspan fill="{t["fixed"]}">&#9679;</tspan> Fixed in this driver</text>'
    )

    # Top and bottom gridlines, labeled with what they count.
    for gy, label in ((plot_y0, f"{up_max} known"), (plot_y1, f"{down_max} fixed")):
        parts.append(f'<line x1="{plot_x0}" y1="{gy:.1f}" x2="{plot_x1}" y2="{gy:.1f}" stroke="{t["grid"]}" stroke-width="1"/>')
        parts.append(f'<text x="{plot_x0}" y="{gy - 5:.1f}" {mono} font-size="10" fill="{t["text_secondary"]}">{label}</text>')

    for i, item in enumerate(series):
        x = bar_x(i)
        title = (f'{item["version"]}: {item["known"]} known issues ({item["fixed_later"]} fixed later, '
                 f'{item["pending"]} still open), {item["fixed"]} bugs fixed in this driver')
        parts.append(f'<g><title>{esc(title)}</title>')
        above = 0
        for key in ("fixed_later", "pending"):
            count = item[key]
            if count == 0:
                continue
            top = base_y - (above + count) * unit
            bottom = base_y - above * unit - (SEGMENT_GAP if above else 1)
            parts.append(f'<rect x="{x:.2f}" y="{top:.1f}" width="{bar_w:.2f}" height="{max(1, bottom - top):.1f}" fill="{t[key]}"/>')
            above += count
        if item["fixed"]:
            top = base_y + 1
            height = item["fixed"] * unit - 1
            parts.append(f'<rect x="{x:.2f}" y="{top:.1f}" width="{bar_w:.2f}" height="{max(1, height):.1f}" fill="{t["fixed"]}"/>')
        parts.append('</g>')

    parts.append(f'<line x1="{plot_x0}" y1="{base_y:.1f}" x2="{plot_x1}" y2="{base_y:.1f}" stroke="{t["border"]}" stroke-width="1"/>')

    # The first and last versions plus a few evenly spaced in between.
    marks = sorted({0, n - 1} | {round(k * (n - 1) / (VERSION_LABELS - 1)) for k in range(1, VERSION_LABELS - 1)})
    for i in marks:
        if i == 0:
            x, anchor = bar_x(0), "start"
        elif i == n - 1:
            x, anchor = bar_x(i) + bar_w, "end"
        else:
            x, anchor = bar_x(i) + bar_w / 2, "middle"
        parts.append(f'<text x="{x:.1f}" y="{plot_y1 + 18}" text-anchor="{anchor}" {mono} font-size="11" '
                     f'fill="{t["text_secondary"]}">{esc(series[i]["version"])}</text>')

    parts.append(
        f'<text x="{WIDTH / 2:.1f}" y="{HEIGHT - 18}" text-anchor="middle" {mono} '
        f'font-size="11" fill="{t["text_secondary"]}">Live &amp; interactive: {esc(SITE_URL)}</text>'
    )

    parts.append("</svg>")
    return "\n".join(parts)


def main():
    series = load_series()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for theme_name in THEMES:
        svg = build_svg(series, theme_name)
        out_path = OUTPUT_DIR / f"bugs-chart-{theme_name}.svg"
        out_path.write_text(svg, encoding="utf-8")
        written.append(out_path)
    for p in written:
        print(f"Wrote {p.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
