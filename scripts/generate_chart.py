#!/usr/bin/env python3
"""
Draw the "Bugs by driver" chart from docs/drivers.json as a static SVG for
the README. Colors match the dark theme in docs/style.css.

Usage:
    python scripts/generate_chart.py
"""
import json
import math
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DATA_PATH = REPO_ROOT / "docs" / "drivers.json"
OUTPUT_DIR = REPO_ROOT / "docs" / "assets"
SITE_URL = "https://indep-arg.github.io/NvidiaWatch/#trends"

THEMES = {
    "dark": {
        "bg": "#1e1c21",
        "border": "#3a3740",
        "text_primary": "#f2f2f2",
        "text_secondary": "#a3a0a8",
        "accent": "#c99aff",
        "fixed": "#8fc7ab",
        "fixed_later": "#e6b422",
        "pending": "#e08276",
        "grid": "#332f38",
    },
}

FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif"
FONT_MONO = "'DM Mono', 'SFMono-Regular', Consolas, monospace"

WIDTH, HEIGHT = 1200, 400
PAD_LEFT, PAD_RIGHT = 44, 24
PAD_TOP, PAD_BOTTOM = 68, 60
SEGMENT_GAP = 2


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


def load_series(path=DATA_PATH):
    with open(path, encoding="utf-8") as f:
        drivers = json.load(f)
    drivers = sorted(drivers, key=lambda d: version_key(d["version"]))
    series = []
    for d in drivers:
        statuses = [bug_status(b, d["version"]) for b in d["bugs"]]
        fixed_later = statuses.count("fixed_later")
        pending = statuses.count("pending")
        series.append({
            "version": d["version"],
            "known": fixed_later + pending,
            "fixed_later": fixed_later,
            "pending": pending,
            "fixed": statuses.count("fixed"),
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

    header = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="{WIDTH}" height="{HEIGHT}" role="img" '
        f'aria-label="Bugs by driver: known issues above the line, bugs fixed in that driver below it">',
        f'<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" rx="14" fill="{t["bg"]}" stroke="{t["border"]}"/>',
        f'<text x="{PAD_LEFT}" y="34" font-family="{FONT_DISPLAY}" font-weight="700" '
        f'font-size="20" fill="{t["text_primary"]}">Bugs by driver</text>',
    ]

    if n == 0:
        return "\n".join(header + [
            f'<text x="{WIDTH / 2:.1f}" y="{HEIGHT / 2:.1f}" text-anchor="middle" font-family="{FONT_MONO}" '
            f'font-size="14" fill="{t["text_secondary"]}">No driver data yet</text>',
            "</svg>",
        ])

    # One scale for both directions, each side rounded up to a multiple of 5.
    up_max = ceil_to(max(item["known"] for item in series), 5)
    down_max = ceil_to(max(item["fixed"] for item in series), 5)
    unit = plot_h / (up_max + down_max)
    base_y = plot_y0 + up_max * unit

    gap = 1.5
    bar_w = max(1.5, (plot_w - gap * (n - 1)) / n)

    def bar_x(i):
        return plot_x0 + i * (bar_w + gap)

    parts = list(header)
    first_v, last_v = series[0]["version"], series[-1]["version"]
    parts.append(
        f'<text x="{PAD_LEFT}" y="54" font-family="{FONT_MONO}" font-size="12" '
        f'fill="{t["text_secondary"]}">{n} driver versions &#183; {esc(first_v)} &#8594; {esc(last_v)} &#183; auto-generated from drivers.json</text>'
    )

    parts.append(
        f'<text x="{WIDTH - PAD_RIGHT}" y="34" text-anchor="end" '
        f'font-family="{FONT_MONO}" font-size="12" fill="{t["text_secondary"]}">'
        f'Known issues: <tspan fill="{t["fixed_later"]}">&#9679;</tspan> Fixed later &#160;'
        f'<tspan fill="{t["pending"]}">&#9679;</tspan> Pending</text>'
    )
    parts.append(
        f'<text x="{WIDTH - PAD_RIGHT}" y="54" text-anchor="end" '
        f'font-family="{FONT_MONO}" font-size="12" fill="{t["text_secondary"]}">'
        f'Below the line: <tspan fill="{t["fixed"]}">&#9679;</tspan> Fixed in this driver</text>'
    )

    # Gridlines and labels at the top, the baseline and the bottom.
    for gy, label in ((plot_y0, up_max), (base_y, 0), (plot_y1, down_max)):
        stroke = t["border"] if label == 0 else t["grid"]
        parts.append(f'<line x1="{plot_x0}" y1="{gy:.1f}" x2="{plot_x1}" y2="{gy:.1f}" stroke="{stroke}" stroke-width="1"/>')
        parts.append(
            f'<text x="{plot_x0 - 8}" y="{gy + 3:.1f}" text-anchor="end" font-family="{FONT_MONO}" '
            f'font-size="10" fill="{t["text_secondary"]}">{label}</text>'
        )

    for i, item in enumerate(series):
        x = bar_x(i)
        title = (f'{item["version"]}: {item["known"]} known issues ({item["fixed_later"]} fixed later, '
                 f'{item["pending"]} pending), {item["fixed"]} bugs fixed in this driver')
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

    first_x = bar_x(0) + bar_w / 2
    last_x = bar_x(n - 1) + bar_w / 2
    parts.append(
        f'<text x="{first_x:.1f}" y="{plot_y1 + 20}" text-anchor="start" font-family="{FONT_MONO}" '
        f'font-size="11" fill="{t["text_secondary"]}">{esc(first_v)}</text>'
    )
    parts.append(
        f'<text x="{last_x:.1f}" y="{plot_y1 + 20}" text-anchor="end" font-family="{FONT_MONO}" '
        f'font-size="11" fill="{t["text_secondary"]}">{esc(last_v)}</text>'
    )

    peak_idx = max(range(n), key=lambda i: series[i]["known"])
    peak = series[peak_idx]
    if peak["known"] > 0:
        peak_x = bar_x(peak_idx) + bar_w / 2
        peak_top = base_y - peak["known"] * unit
        marker_y = max(plot_y0 + 12, peak_top - 14)
        anchor = "start" if peak_x < plot_x0 + plot_w * 0.33 else "end" if peak_x > plot_x0 + plot_w * 0.66 else "middle"
        label_dx = 6 if anchor == "start" else -6 if anchor == "end" else 0
        parts.append(f'<line x1="{peak_x:.1f}" y1="{marker_y:.1f}" x2="{peak_x:.1f}" y2="{peak_top:.1f}" stroke="{t["accent"]}" stroke-width="1" stroke-dasharray="2,2"/>')
        parts.append(f'<circle cx="{peak_x:.1f}" cy="{marker_y:.1f}" r="3" fill="{t["accent"]}"/>')
        parts.append(
            f'<text x="{peak_x + label_dx:.1f}" y="{marker_y + 4:.1f}" dx="{8 if anchor == "start" else -8 if anchor == "end" else 0}" '
            f'text-anchor="{anchor}" font-family="{FONT_MONO}" font-weight="500" font-size="11" fill="{t["accent"]}">'
            f'{esc(peak["version"])} &#183; most known issues ({peak["known"]})</text>'
        )

    parts.append(
        f'<text x="{WIDTH / 2:.1f}" y="{HEIGHT - 18}" text-anchor="middle" font-family="{FONT_MONO}" '
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
