// Tests for docs/lib.js. Run with: node --test tests/lib.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const lib = require('../docs/lib.js');

const bug = (fixed_in, extra = {}) => ({ description: 'Test bug', ids: [], fixed_in, ...extra });

test('compareVersions sorts numerically per segment', () => {
    const versions = ['581.10', '581.9', '576.02', '617.14'];
    assert.deepEqual([...versions].sort(lib.compareVersions), ['576.02', '581.9', '581.10', '617.14']);
    assert.equal(lib.compareVersions('581.80', '581.80'), 0);
});

test('formatVersion pads to two decimals and leaves non-numbers alone', () => {
    assert.equal(lib.formatVersion('581.8'), '581.80');
    assert.equal(lib.formatVersion('581.80'), '581.80');
    assert.equal(lib.formatVersion('beta'), 'beta');
});

test('bugStatus matches the shared cases (same file as the Python chart tests)', () => {
    const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'status_cases.json'), 'utf8'));
    cases.forEach(c => assert.equal(lib.bugStatus(bug(c.fixed_in), c.version), c.status, JSON.stringify(c)));
});

test('fixedInVersion only reads a driver version', () => {
    assert.equal(lib.fixedInVersion(bug('Fixed (581.94)')), '581.94');
    assert.equal(lib.fixedInVersion(bug('Fixed External')), null);
    assert.equal(lib.fixedInVersion(bug(null)), null);
});

test('escapeHTML escapes markup characters', () => {
    assert.equal(lib.escapeHTML(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('highlightText marks matches without breaking entities', () => {
    assert.equal(lib.highlightText('DLSS & DLAA', 'dl'), '<mark class="highlight">DL</mark>SS &amp; <mark class="highlight">DL</mark>AA');
    assert.equal(lib.highlightText('Tom & Jerry', 'amp'), 'Tom &amp; Jerry');
    assert.equal(lib.highlightText('DLSS 4.0 (beta)', '(beta)'), 'DLSS 4.0 <mark class="highlight">(beta)</mark>');
    assert.equal(lib.highlightText('<b>', ''), '&lt;b&gt;');
});

test('bugMatchesQuery checks description, status and IDs', () => {
    const b = bug(null, { description: 'Cyberpunk 2077 crash', ids: ['3829994'] });
    assert.ok(lib.bugMatchesQuery(b, ''));
    assert.ok(lib.bugMatchesQuery(b, 'cyberpunk'));
    assert.ok(lib.bugMatchesQuery(b, 'pending'));
    assert.ok(lib.bugMatchesQuery(b, '3829994'));
    assert.ok(lib.bugMatchesQuery(b, '#3829994'));
    assert.ok(!lib.bugMatchesQuery(b, '#'));
    assert.ok(!lib.bugMatchesQuery(b, 'fixed'));
});

const drivers = [
    { version: '581.80', bugs: [bug('Fixed (581.80)', { description: 'DLSS flicker' }), bug(null, { description: 'Crash' })] },
    { version: '581.94', bugs: [bug(null, { description: 'DLSS stutter' })] },
    { version: '576.02', bugs: [bug('Fixed (581.80)'), bug('Fixed (576.02)'), bug(null)] },
];

test('filterAndSortDrivers applies status filter before search', () => {
    const fixedDlss = lib.filterAndSortDrivers(drivers, { query: 'dlss', filter: 'fixed' });
    assert.deepEqual(fixedDlss.map(d => d.version), ['581.80']);
    const pending = lib.filterAndSortDrivers(drivers, { filter: 'pending' });
    assert.deepEqual(pending.map(d => d.version), ['581.94', '581.80', '576.02']);
});

test('status filters: fixed means fixed in that driver, known means fixed later or still open', () => {
    // 576.02 lists one bug fixed in 581.80: a known issue of 576.02, not a fix.
    assert.deepEqual(lib.filterAndSortDrivers(drivers, { filter: 'fixed' }).map(d => d.version), ['581.80', '576.02']);
    assert.deepEqual(lib.visibleBugs(drivers[2], 'fixed', '').map(b => b.fixed_in), ['Fixed (576.02)']);
    assert.deepEqual(lib.visibleBugs(drivers[2], 'known', '').map(b => b.fixed_in), ['Fixed (581.80)', null]);
});

test('filterAndSortDrivers filters by channel', () => {
    const withChannels = [
        { version: '600.00', channels: ['game-ready'], bugs: [] },
        { version: '600.10', channels: ['game-ready', 'studio'], bugs: [] },
        { version: '600.20', bugs: [] },
    ];
    assert.deepEqual(lib.filterAndSortDrivers(withChannels, { channel: 'studio' }).map(d => d.version), ['600.10']);
    assert.equal(lib.filterAndSortDrivers(withChannels, { channel: 'all' }).length, 3);
});

test('filterAndSortDrivers matches the version text', () => {
    assert.deepEqual(lib.filterAndSortDrivers(drivers, { query: 'driver 576' }).map(d => d.version), ['576.02']);
});

test('filterAndSortDrivers sorts and does not modify the input', () => {
    const before = drivers.map(d => d.version);
    assert.deepEqual(lib.filterAndSortDrivers(drivers, { sort: 'version-asc' }).map(d => d.version), ['576.02', '581.80', '581.94']);
    // bugs-* sort by known issues, not by every bug listed
    assert.deepEqual(lib.filterAndSortDrivers(drivers, { sort: 'bugs-desc' }).map(d => d.version), ['576.02', '581.80', '581.94']);
    assert.deepEqual(lib.filterAndSortDrivers(drivers, { sort: 'bugs-asc' }).map(d => d.version), ['581.80', '581.94', '576.02']);
    assert.deepEqual(drivers.map(d => d.version), before);
});

test('visibleBugs keeps only bugs matching filter and search', () => {
    assert.equal(lib.visibleBugs(drivers[0], 'pending', '').length, 1);
    assert.equal(lib.visibleBugs(drivers[0], 'all', 'dlss').length, 1);
    assert.equal(lib.visibleBugs(drivers[0], 'fixed', 'crash').length, 0);
});

test('knownIssueCount leaves out the bugs a driver fixed', () => {
    assert.equal(lib.knownIssueCount(drivers[0]), 1);
    assert.equal(lib.knownIssueCount(drivers[2]), 2);
});

test('summaryStats counts fixes apart from known issues', () => {
    assert.deepEqual(lib.summaryStats(drivers), { drivers: 3, bugs: 6, fixed: 2, fixedLater: 1, pending: 3, known: 4, fixedLaterRate: 25 });
    assert.deepEqual(lib.summaryStats([]), { drivers: 0, bugs: 0, fixed: 0, fixedLater: 0, pending: 0, known: 0, fixedLaterRate: 0 });
});

test('driverBugs splits a driver into its fixes and its known issues', () => {
    const split = lib.driverBugs(drivers[2]);
    assert.deepEqual(split.fixed.map(b => b.fixed_in), ['Fixed (576.02)']);
    assert.deepEqual(split.known.map(b => b.fixed_in), ['Fixed (581.80)', null]);
});

test('latestDriver, neighbours and openBugs', () => {
    const withChannels = drivers.map((d, i) => ({ ...d, channels: i === 2 ? ['game-ready', 'studio'] : ['game-ready'] }));
    assert.equal(lib.latestDriver(withChannels).version, '581.94');
    assert.equal(lib.latestDriver(withChannels, 'studio').version, '576.02');
    assert.equal(lib.latestDriver([], 'studio'), null);
    const n = lib.neighbours(drivers, '581.80');
    assert.deepEqual([n.previous.version, n.next.version], ['576.02', '581.94']);
    assert.equal(lib.neighbours(drivers, '581.94').next, null);
    assert.deepEqual(lib.openBugs(drivers).map(o => o.driver.version), ['581.94', '581.80', '576.02']);
});

test('trendSeries builds chronological per-status counts', () => {
    const all = lib.trendSeries(drivers, 'all');
    assert.deepEqual(all.map(s => s.version), ['576.02', '581.80', '581.94']);
    assert.deepEqual(all[0], { version: '576.02', known: 2, fixedLater: 1, pending: 1, fixed: 1 });
});

test('trendSeries ranges', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
        version: `${500 + i}.00`,
        bugs: Array.from({ length: i % 7 }, () => bug(null)),
    }));
    const recent = lib.trendSeries(many, 'recent');
    assert.equal(recent.length, 20);
    assert.equal(recent[19].version, '529.00');
    const worst = lib.trendSeries(many, 'worst');
    assert.equal(worst.length, 15);
    const minKept = Math.min(...worst.map(s => s.known));
    const kept = new Set(worst.map(s => s.version));
    assert.ok(lib.trendSeries(many, 'all').filter(s => !kept.has(s.version)).every(s => s.known <= minKept));
    assert.deepEqual(worst.map(s => s.version), [...worst.map(s => s.version)].sort(lib.compareVersions));
});

test('paginationPages', () => {
    assert.deepEqual(lib.paginationPages(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(lib.paginationPages(2, 10), [1, 2, 3, 4, 5, '...', 10]);
    assert.deepEqual(lib.paginationPages(9, 10), [1, '...', 6, 7, 8, 9, 10]);
    assert.deepEqual(lib.paginationPages(5, 10), [1, '...', 4, 5, 6, '...', 10]);
});

test('real drivers.json works with every helper', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const stats = lib.summaryStats(data);
    assert.equal(stats.drivers, data.length);
    assert.equal(stats.fixed + stats.known, stats.bugs);
    assert.equal(lib.trendSeries(data, 'all').length, data.length);
    assert.equal(lib.filterAndSortDrivers(data).length, data.length);
});

const events = [
    { date: '2025-02-20', driver: '572.47', gpus: ['GeForce RTX 5070 Ti'], family: 'RTX 50 series', source: 'https://example.com/b' },
    { date: '2024-01-31', driver: '551.31', gpus: ['GeForce RTX 4080 SUPER'], family: 'RTX 40 series', source: 'https://example.com/a' },
    { date: '2025-01-30', driver: '572.16', gpus: ['GeForce RTX 5090', 'GeForce RTX 5080'], family: 'RTX 50 series', source: 'https://example.com/c' },
    { date: '2023-01-05', driver: '528.02', gpus: ['GeForce RTX 4070 Ti'], family: 'RTX 40 series', source: 'https://example.com/d' },
];

test('daysBetween counts calendar days', () => {
    assert.equal(lib.daysBetween('2024-02-28', '2024-03-01'), 2);
    assert.equal(lib.daysBetween('2025-01-30', '2025-01-30'), 0);
});

test('launchBands merges consecutive events of the same family', () => {
    const bands = lib.launchBands(events);
    assert.deepEqual(bands.map(b => [b.family, b.start, b.end, b.events.length]), [
        ['RTX 40 series', '2023-01-05', '2024-01-31', 2],
        ['RTX 50 series', '2025-01-30', '2025-02-20', 2],
    ]);
});

test('launchesByDriver maps a driver to the GPUs it launched', () => {
    const map = lib.launchesByDriver(events);
    assert.deepEqual(map.get('572.16'), ['GeForce RTX 5090', 'GeForce RTX 5080']);
    assert.equal(map.get('999.99'), undefined);
});

test('timelineSeries sorts by date and skips drivers without one', () => {
    const withDates = [
        { version: '581.94', release_date: '2025-11-18', bugs: [bug(null)] },
        { version: '581.80', release_date: '2025-11-04', bugs: [bug('Fixed (581.80)')] },
        { version: '500.00', bugs: [] },
    ];
    const series = lib.timelineSeries(withDates);
    assert.deepEqual(series.map(s => [s.version, s.date, s.known, s.fixed]), [['581.80', '2025-11-04', 0, 1], ['581.94', '2025-11-18', 1, 0]]);
});

test('real events.json lines up with drivers.json', () => {
    const docs = path.join(__dirname, '..', 'docs');
    const data = JSON.parse(fs.readFileSync(path.join(docs, 'drivers.json'), 'utf8'));
    const realEvents = JSON.parse(fs.readFileSync(path.join(docs, 'events.json'), 'utf8'));
    const series = lib.timelineSeries(data);
    assert.equal(series.length, data.filter(d => d.release_date).length);
    const bands = lib.launchBands(realEvents);
    assert.ok(bands.length >= 1);
    bands.forEach(b => assert.ok(b.start <= b.end));
});

test('carriedOverCounts counts bugs between the driver that lists them and their fix', () => {
    const chain = [
        { version: '531.41', bugs: [bug('Fixed (536.23)'), bug('Fixed (531.41)'), bug(null), bug('Fixed External')] },
        { version: '531.61', bugs: [] },
        { version: '531.68', bugs: [] },
        { version: '536.23', bugs: [] },
        { version: '536.40', bugs: [] },
    ];
    const counts = lib.carriedOverCounts(chain);
    assert.deepEqual([...counts.entries()], [['531.41', 0], ['531.61', 1], ['531.68', 1], ['536.23', 0], ['536.40', 0]]);
});

test('trendSeries is unchanged unless carried-over issues are asked for', () => {
    assert.deepEqual(lib.trendSeries(drivers, 'all'), lib.trendSeries(drivers, 'all', {}));
    assert.ok(lib.trendSeries(drivers, 'all').every(s => !('carried' in s)));
    // No driver here sits between 576.02 and the 581.80 fix, so nothing is carried.
    const withCarried = lib.trendSeries(drivers, 'all', { includeCarried: true });
    assert.deepEqual(withCarried.map(s => s.carried), [0, 0, 0]);
});

test('real data: the Reddit example 4063597 is a known issue of 531.61, which repeated it', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const d = lib.asListed(data).find(x => x.version === '531.61');
    assert.ok(lib.driverBugs(d).known.some(b => b.ids.includes('4063597') && b.since === '531.41'));
    assert.ok(!lib.carriedOverBugs(data, '531.61').some(c => c.bug.ids.includes('4063597')));
});

test('carriedOverBugs lists what carriedOverCounts counts', () => {
    const chain = [
        { version: '531.41', bugs: [bug('Fixed (536.23)', { ids: ['4063597'] }), bug('Fixed (531.41)'), bug(null), bug('Fixed External')] },
        { version: '531.61', bugs: [] },
        { version: '536.23', bugs: [] },
    ];
    const carried = lib.carriedOverBugs(chain, '531.61');
    assert.deepEqual(carried.map(c => [c.from, c.to, c.bug.ids[0]]), [['531.41', '536.23', '4063597']]);
    assert.equal(lib.carriedOverBugs(chain, '536.23').length, 0);
});

test('real data: carriedOverBugs and carriedOverCounts agree for every driver', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const counts = lib.carriedOverCounts(data);
    data.forEach(d => assert.equal(lib.carriedOverBugs(data, d.version).length, counts.get(d.version), d.version));
});

test('bugHistory: where a bug was listed and which drivers carried it', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const h = lib.bugHistory(data, '4063597');
    assert.deepEqual(h.mentions.map(m => [m.driver.version, m.status]), [['531.41', 'fixed-later']]);
    // NVIDIA repeated it in every driver until the fix, except 532.03, whose
    // release notes leave it out and which has no feedback thread.
    assert.deepEqual(h.relisted.map(d => d.version), ['531.61', '531.68', '531.79', '535.98']);
    assert.deepEqual(h.carried.map(d => d.version), ['532.03']);
    assert.deepEqual(lib.bugHistory(data, '0000000'), { mentions: [], relisted: [], carried: [] });
});

test('withEarlierFixes adds fixes of earlier known issues to the driver that fixed them', () => {
    const drivers = [
        { version: '581.94', bugs: [{ description: 'Crash', ids: ['2'], fixed_in: 'Fixed (581.94)' }] },
        { version: '581.80', bugs: [
            { description: 'Flicker', ids: ['1'], fixed_in: 'Fixed (581.94)' },
            { description: 'Crash', ids: ['2'], fixed_in: 'Fixed (581.94)' },
            { description: 'Profile', ids: ['3'], fixed_in: 'Fixed (OTA profile update)' },
        ] },
    ];
    const result = lib.withEarlierFixes(drivers);
    const newer = result.find(d => d.version === '581.94');
    assert.deepEqual(newer.bugs.map(b => [b.ids[0], b.listedIn]), [['2', undefined], ['1', '581.80']]);
    assert.equal(lib.bugStatus(newer.bugs[1], '581.94'), 'fixed');
    assert.equal(result.find(d => d.version === '581.80'), drivers[1]);
    assert.equal(drivers[0].bugs.length, 1);
});

test('real data: 616.92 shows the flicker fix listed in 616.64', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const d = lib.withEarlierFixes(data).find(x => x.version === '616.92');
    const { fixed } = lib.driverBugs(d);
    assert.deepEqual(fixed.map(b => b.ids[0]), ['6674464', '6687328', '6673430']);
    assert.equal(fixed[2].listedIn, '616.64');
    assert.equal(lib.trendSeries(lib.withEarlierFixes(data), 'all').reduce((n, s) => n + s.fixed, 0), fixTotal(data));
});

test('fixedElsewhere connects an open entry to the same ID fixed in that driver or later', () => {
    const open = { description: 'Crash', ids: ['7'], fixed_in: null };
    const drivers = [
        { version: '528.24', bugs: [open] },
        { version: '528.49', bugs: [{ description: 'Crash', ids: ['7'], fixed_in: 'Fixed (528.49)' }] },
        { version: '520.00', bugs: [{ description: 'Old', ids: ['7'], fixed_in: 'Fixed (521.00)' }] },
    ];
    assert.deepEqual(lib.fixedElsewhere(drivers, open, '528.24'), { to: '528.49', listedIn: '528.49' });
    assert.equal(lib.fixedElsewhere(drivers, { ...open, ids: ['8'] }, '528.24'), null);
    assert.equal(lib.fixedElsewhere(drivers, drivers[1].bugs[0], '528.49'), null);
});

test('real data: only the open entry whose ID was fixed elsewhere gets the note', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const found = data.flatMap(d => d.bugs.map(b => [d.version, b.ids[0], lib.fixedElsewhere(data, b, d.version)])).filter(x => x[2]);
    assert.deepEqual(found.map(([v, id, f]) => [v, id, f.to]), [['560.94', '4679970', '561.09']]);
});

test('withRelisted adds the open issues a driver repeated, from the latest earlier entry', () => {
    const drivers = [
        { version: '610.47', bugs: [{ description: 'Power mode', ids: ['1'], fixed_in: null }] },
        { version: '610.62', bugs: [{ description: 'Crash', ids: ['2'], fixed_in: 'Fixed (617.14)' }], still_open: ['1'] },
        { version: '616.92', bugs: [], still_open: ['1', '2'] },
        { version: '617.14', bugs: [{ description: 'Crash', ids: ['2'], fixed_in: 'Fixed (617.14)' }], still_open: ['1'] },
    ];
    const listed = lib.withRelisted(drivers);
    const v = listed.find(d => d.version === '616.92');
    assert.deepEqual(v.bugs.map(b => [b.ids[0], b.since, lib.bugStatus(b, '616.92')]), [['1', '610.47', 'pending'], ['2', '610.62', 'fixed-later']]);
    assert.equal(listed[0], drivers[0]);
    // Repeated in 616.92, so not carried there; still carried nowhere else in between.
    assert.deepEqual(lib.carriedOverBugs(drivers, '616.92'), []);
    assert.equal(lib.carriedOverCounts(lib.asListed(drivers)).get('616.92'), 0);
    const h = lib.bugHistory(drivers, '1');
    assert.deepEqual([h.mentions.map(m => m.driver.version), h.relisted.map(d => d.version), h.carried], [['610.47'], ['610.62', '616.92', '617.14'], []]);
    assert.equal(lib.openBugs(lib.asListed(drivers)).length, 1);
});

// Totals the charts should add up to, counted straight from the file so
// adding a driver doesn't mean editing these tests. test_generate_chart.py
// counts the same way.
function fixTotal(data) {
    const versions = new Set(data.map(d => d.version));
    return data.flatMap(d => d.bugs).filter(b => versions.has(lib.fixedInVersion(b))).length;
}

function knownTotal(data) {
    return data.reduce((n, d) => n + lib.knownIssueCount(d) + (d.still_open || []).length, 0);
}

test('real data: 617.14 repeats the two open issues NVIDIA posted', () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'drivers.json'), 'utf8'));
    const d = lib.asListed(data).find(x => x.version === '617.14');
    assert.deepEqual(lib.driverBugs(d).known.map(b => [b.ids[0], b.since]), [['6007998', '610.47'], ['6685219', '616.92']]);
    const series = lib.trendSeries(lib.asListed(data), 'all');
    assert.equal(series.reduce((n, s) => n + s.known, 0), knownTotal(data));
    assert.equal(series.reduce((n, s) => n + s.fixed, 0), fixTotal(data));
    assert.equal(lib.openBugs(lib.asListed(data)).length, data.flatMap(d => d.bugs).filter(b => b.fixed_in === null).length);
});
