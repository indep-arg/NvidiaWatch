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

test('bugStatus splits fixed, fixed later and pending', () => {
    assert.equal(lib.bugStatus(bug(null), '581.80'), 'pending');
    assert.equal(lib.bugStatus(bug('Fixed (581.80)'), '581.80'), 'fixed');
    assert.equal(lib.bugStatus(bug('Fixed (581.94)'), '581.80'), 'fixed-later');
    assert.equal(lib.bugStatus(bug('Fixed External'), '581.80'), 'fixed-later');
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

test('computeStats counts fix rate and pending over all bugs', () => {
    assert.deepEqual(lib.computeStats(drivers), { totalDrivers: 3, totalBugs: 6, fixedRate: 50, pending: 3 });
    assert.deepEqual(lib.computeStats([]), { totalDrivers: 0, totalBugs: 0, fixedRate: 0, pending: 0 });
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
    const stats = lib.computeStats(data);
    assert.equal(stats.totalDrivers, data.length);
    assert.equal(lib.trendSeries(data, 'all').length, data.length);
    assert.equal(lib.filterAndSortDrivers(data).length, data.length);
});
