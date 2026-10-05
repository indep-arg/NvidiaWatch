// The chart on its own page: four ranges and the optional carried-over issues.
import { esc, driverHref, query } from '../ui.js';
import { renderChart, legendHTML } from '../chart.js';

const lib = window.NvidiaWatch;
const RANGES = [['recent', 'Latest 20'], ['worst', 'Most affected'], ['all', 'All time'], ['timeline', 'Timeline']];

export function render(main, { listed: drivers, events, params, navigate }) {
    const range = RANGES.some(([r]) => r === params.get('range')) ? params.get('range') : 'all';
    const carried = params.get('carried') === '1';
    const timeline = range === 'timeline';
    const series = timeline
        ? lib.timelineSeries(drivers, { includeCarried: carried })
        : lib.trendSeries(drivers, range, { includeCarried: carried });
    const href = (r, c) => query({ view: 'trends', range: r !== 'all' && r, carried: c });
    const worst = [...lib.trendSeries(drivers, 'all')].sort((a, b) => b.known - a.known)[0];
    const dated = drivers.filter(d => d.release_date).map(d => d.release_date).sort();

    const notes = {
        recent: 'The 20 newest drivers, oldest on the left.',
        worst: 'The 15 drivers with the most known issues, in version order.',
        all: worst ? `All ${drivers.length} drivers, oldest on the left. Most known issues: ${worst.version} (${worst.known}).` : '',
        timeline: dated.length ? `Each bar sits on the driver's release date, from ${dated[0]} to ${dated[dated.length - 1]}. Shaded areas are GPU launch periods.` : '',
    };

    main.innerHTML = `
        <h1 class="page-title">Trends</h1>
        <nav class="tabs" aria-label="Chart range">${RANGES.map(([r, t]) => `<a href="${href(r, carried)}" data-nav${r === range ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
        <div class="toolbar">
            ${legendHTML({ carried, launches: timeline })}
            <label class="switch"><input type="checkbox" id="carried-toggle"${carried ? ' checked' : ''}> Include carried-over issues</label>
        </div>
        <div id="trends-chart"></div>
        <p class="explain spaced">${esc(notes[range])} <a href="?view=about" data-nav>How to read this</a>.</p>`;

    renderChart(main.querySelector('#trends-chart'), series, {
        timeline,
        events,
        carried,
        height: 300,
        label: `Known issues and fixes per driver, ${RANGES.find(([r]) => r === range)[1].toLowerCase()}`,
        onSelect: version => navigate(driverHref(version)),
    });
    main.querySelector('#carried-toggle').addEventListener('change', e => {
        navigate(href(range, e.target.checked), { replace: true });
        document.getElementById('carried-toggle').focus();
    });
    return 'Trends';
}
