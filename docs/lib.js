// Pure helpers shared by script.js and the Node tests (tests/lib.test.js).
// No DOM access here.
(function (root) {
    const CHANNEL_LABELS = { 'game-ready': 'Game Ready', 'studio': 'Studio' };

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Matches on the raw text and escapes each piece afterwards, so a query
    // like "amp" never lands inside an entity such as "&amp;".
    function highlightText(text, query) {
        if (!query) return escapeHTML(text);
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeQuery})`, 'gi');
        return String(text)
            .split(regex)
            .map((part, i) => i % 2 ? `<mark class="highlight">${escapeHTML(part)}</mark>` : escapeHTML(part))
            .join('');
    }

    function formatVersion(version) {
        const verNum = parseFloat(version);
        return !isNaN(verNum) ? verNum.toFixed(2) : version;
    }

    // Numeric per segment, so "581.9" sorts before "581.10".
    function compareVersions(a, b) {
        const splitA = a.split('.').map(n => parseFloat(n) || 0);
        const splitB = b.split('.').map(n => parseFloat(n) || 0);
        const len = Math.max(splitA.length, splitB.length);
        for (let i = 0; i < len; i++) {
            const valA = splitA[i] || 0;
            const valB = splitB[i] || 0;
            if (valA !== valB) return valA - valB;
        }
        return 0;
    }

    // 'fixed': this driver fixed it (listed under the driver's own fixes).
    // 'fixed-later' and 'pending': a known issue in this driver.
    // Same rule as bug_status() in scripts/generate_chart.py.
    function bugStatus(bug, version) {
        if (bug.fixed_in === null) return 'pending';
        if (bug.fixed_in === `Fixed (${version})`) return 'fixed';
        return 'fixed-later';
    }

    // "Fixed (581.80)" -> "581.80"; anything else (pending, "Fixed External") -> null.
    function fixedInVersion(bug) {
        const m = /^Fixed \((\d+\.\d{2})\)$/.exec(bug.fixed_in || '');
        return m ? m[1] : null;
    }

    function knownIssueCount(driver) {
        return driver.bugs.filter(bug => bugStatus(bug, driver.version) !== 'fixed').length;
    }

    // A driver's own bugs, split the way the driver view lists them.
    function driverBugs(driver) {
        const fixed = [];
        const known = [];
        driver.bugs.forEach(bug => (bugStatus(bug, driver.version) === 'fixed' ? fixed : known).push(bug));
        return { fixed, known };
    }

    // 'pending': still open. 'fixed': fixed in that driver. 'known': a known
    // issue of that driver, fixed later or still open. Anything else: all.
    function matchesStatusFilter(bug, version, filter) {
        if (filter === 'pending') return bug.fixed_in === null;
        if (filter === 'fixed') return bugStatus(bug, version) === 'fixed';
        if (filter === 'known') return bugStatus(bug, version) !== 'fixed';
        return true;
    }

    // `query` is expected lowercased and trimmed. IDs match with or without
    // the leading "#".
    function bugMatchesQuery(bug, query) {
        if (!query) return true;
        const idQuery = query.replace(/^#/, '');
        return (bug.description || '').toLowerCase().includes(query) ||
            (bug.fixed_in || 'Pending').toLowerCase().includes(query) ||
            (idQuery !== '' && (bug.ids || []).some(id => id.includes(idQuery)));
    }

    // Bugs a driver shows under the active status filter and search.
    function visibleBugs(driver, filter, query) {
        return driver.bugs.filter(bug => matchesStatusFilter(bug, driver.version, filter) && bugMatchesQuery(bug, query));
    }

    // A driver is kept if its version matches the search, or if one of its
    // bugs matches both the status filter and the search. With a status
    // filter set, drivers with no bugs of that status are dropped.
    function filterAndSortDrivers(drivers, { query = '', filter = 'all', sort = 'version-desc', channel = 'all' } = {}) {
        const result = drivers.filter(driver => {
            if (channel !== 'all' && !(driver.channels || []).includes(channel)) return false;
            const bugsMatchingStatus = driver.bugs.filter(bug => matchesStatusFilter(bug, driver.version, filter));
            if (filter !== 'all' && bugsMatchingStatus.length === 0) return false;
            const versionText = `driver ${formatVersion(driver.version)}`.toLowerCase();
            return versionText.includes(query) || bugsMatchingStatus.some(bug => bugMatchesQuery(bug, query));
        });
        result.sort((a, b) => {
            switch (sort) {
                case 'version-asc': return compareVersions(a.version, b.version);
                case 'version-desc': return compareVersions(b.version, a.version);
                case 'bugs-asc': return knownIssueCount(a) - knownIssueCount(b);
                case 'bugs-desc': return knownIssueCount(b) - knownIssueCount(a);
                default: return 0;
            }
        });
        return result;
    }

    // Totals for the overview. fixedLaterRate is the share of known issues
    // that a later driver (or a fix outside the driver) resolved.
    function summaryStats(drivers) {
        const totals = { drivers: drivers.length, bugs: 0, fixed: 0, fixedLater: 0, pending: 0 };
        drivers.forEach(d => d.bugs.forEach(b => {
            totals.bugs++;
            const status = bugStatus(b, d.version);
            if (status === 'fixed') totals.fixed++;
            else if (status === 'pending') totals.pending++;
            else totals.fixedLater++;
        }));
        totals.known = totals.fixedLater + totals.pending;
        totals.fixedLaterRate = totals.known > 0 ? Math.round((totals.fixedLater / totals.known) * 100) : 0;
        return totals;
    }

    function byVersion(drivers) {
        return [...drivers].sort((a, b) => compareVersions(a.version, b.version));
    }

    // Newest driver, or the newest one released on `channel`.
    function latestDriver(drivers, channel) {
        const pool = channel ? drivers.filter(d => (d.channels || []).includes(channel)) : drivers;
        return byVersion(pool).pop() || null;
    }

    function neighbours(drivers, version) {
        const sorted = byVersion(drivers);
        const i = sorted.findIndex(d => d.version === version);
        return { previous: i > 0 ? sorted[i - 1] : null, next: i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null };
    }

    // Bugs logged under an earlier driver and fixed after `version`, so that
    // driver had them too. Pending bugs and fixes outside the driver have no
    // known end and never count.
    // A bug NVIDIA repeated in this driver's own notes (`still_open`) is one of
    // its known issues instead. Copies added by withEarlierFixes() and
    // withRelisted() are skipped, so the drivers they return work here too.
    function carriedOverBugs(drivers, version) {
        const target = drivers.find(d => d.version === version);
        const relisted = new Set((target && target.still_open) || []);
        const carried = [];
        byVersion(drivers).forEach(d => {
            if (compareVersions(d.version, version) >= 0) return;
            d.bugs.forEach(bug => {
                if (isCopy(bug) || (bug.ids || []).some(id => relisted.has(id))) return;
                const to = fixedInVersion(bug);
                if (to && to !== d.version && compareVersions(to, version) > 0) carried.push({ bug, from: d.version, to });
            });
        });
        return carried;
    }

    const isCopy = bug => Boolean(bug.listedIn || bug.since);

    // The entry a repeated open issue comes from: the latest earlier driver
    // that has that bug ID.
    function relistedEntry(drivers, id, version) {
        let found = null;
        drivers.forEach(d => {
            if (compareVersions(d.version, version) >= 0) return;
            d.bugs.forEach(bug => {
                if (isCopy(bug) || !(bug.ids || []).includes(id)) return;
                if (!found || compareVersions(d.version, found.version) > 0) found = { version: d.version, bug };
            });
        });
        return found;
    }

    // NVIDIA repeats open issues in every driver's notes until they're fixed.
    // `still_open` lists the IDs a driver repeated; this adds those bugs to the
    // driver's own list, marked with `since` (the driver whose entry they come
    // from). The data itself isn't changed.
    function withRelisted(drivers) {
        return drivers.map(d => {
            if (!(d.still_open || []).length) return d;
            const extra = d.still_open
                .map(id => relistedEntry(drivers, id, d.version))
                .filter(Boolean)
                .map(found => ({ ...found.bug, since: found.version }));
            return { ...d, bugs: [...d.bugs, ...extra] };
        });
    }

    // Every driver as its page lists it: its own bugs, the known issues of
    // earlier drivers that it fixed, and the open issues it repeated.
    function asListed(drivers) {
        return withRelisted(withEarlierFixes(drivers));
    }

    // A known issue fixed in a later driver is logged once, under the driver
    // that listed it. This returns the drivers with those fixes also added to
    // the driver that fixed them, marked with `listedIn`, unless that driver
    // already has the bug. The data itself isn't changed.
    function withEarlierFixes(drivers) {
        const added = new Map();
        byVersion(drivers).forEach(d => d.bugs.forEach(bug => {
            const to = fixedInVersion(bug);
            if (!to || to === d.version || isCopy(bug)) return;
            if (!added.has(to)) added.set(to, []);
            added.get(to).push({ ...bug, listedIn: d.version });
        }));
        return drivers.map(d => {
            const extra = added.get(d.version);
            if (!extra) return d;
            const ids = new Set();
            const texts = new Set();
            const seen = bug => (bug.ids || []).length ? bug.ids.some(id => ids.has(id)) : texts.has(bug.description.toLowerCase());
            const remember = bug => { (bug.ids || []).forEach(id => ids.add(id)); texts.add(bug.description.toLowerCase()); };
            d.bugs.forEach(remember);
            const bugs = [...d.bugs];
            extra.forEach(bug => {
                if (seen(bug)) return;
                remember(bug);
                bugs.push(bug);
            });
            return { ...d, bugs };
        });
    }

    // A bug still open in `version` whose ID another entry lists as fixed in
    // that driver or a later one: { to, listedIn } for the earliest such fix,
    // else null. NVIDIA sometimes lists the same ID twice; this keeps the two
    // entries connected without changing either.
    function fixedElsewhere(drivers, bug, version) {
        if (bug.fixed_in !== null || !(bug.ids || []).length) return null;
        let found = null;
        drivers.forEach(d => d.bugs.forEach(other => {
            if (other === bug || !(other.ids || []).some(id => bug.ids.includes(id))) return;
            const to = fixedInVersion(other);
            if (!to || compareVersions(to, version) < 0) return;
            if (!found || compareVersions(to, found.to) < 0) found = { to, listedIn: d.version };
        }));
        return found;
    }

    // Bugs nobody has logged a fix for yet, newest driver first.
    function openBugs(drivers) {
        return byVersion(drivers).reverse()
            .flatMap(driver => driver.bugs.filter(bug => bug.fixed_in === null && !isCopy(bug)).map(bug => ({ driver, bug })));
    }

    // Everything the data says about one NVIDIA bug ID: each driver that lists
    // it, the drivers that repeated it as still open, and the drivers in
    // between that carried it until a logged fix.
    function bugHistory(drivers, id) {
        const sorted = byVersion(drivers);
        const mentions = [];
        sorted.forEach(driver => driver.bugs.forEach(bug => {
            if (!isCopy(bug) && (bug.ids || []).includes(id)) mentions.push({ driver, bug, status: bugStatus(bug, driver.version) });
        }));
        const listed = new Set(mentions.map(m => m.driver.version));
        const relisted = sorted.filter(d => !listed.has(d.version) && (d.still_open || []).includes(id));
        relisted.forEach(d => listed.add(d.version));
        const carried = sorted.filter(d => !listed.has(d.version) && mentions.some(m => {
            const to = fixedInVersion(m.bug);
            return to && compareVersions(d.version, m.driver.version) > 0 && compareVersions(d.version, to) < 0;
        }));
        return { mentions, relisted, carried };
    }

    // Bugs logged under an earlier driver and fixed after this one, per driver
    // version. Same rule as carriedOverBugs(), counted for every driver at once.
    function carriedOverCounts(drivers) {
        const versions = drivers.map(d => d.version).sort(compareVersions);
        const counts = new Map(versions.map(v => [v, 0]));
        const relisted = new Map(drivers.map(d => [d.version, new Set(d.still_open || [])]));
        drivers.forEach(d => {
            d.bugs.forEach(b => {
                const to = fixedInVersion(b);
                if (!to || to === d.version || isCopy(b)) return;
                versions.forEach(v => {
                    if ((b.ids || []).some(id => relisted.get(v).has(id))) return;
                    if (compareVersions(v, d.version) > 0 && compareVersions(v, to) < 0) {
                        counts.set(v, counts.get(v) + 1);
                    }
                });
            });
        });
        return counts;
    }

    // 'recent': the 20 newest versions. 'worst': the 15 with the most known
    // issues, put back in version order. 'all': everything.
    // With includeCarried, each item also gets `carried` (see carriedOverCounts)
    // and the 'worst' range ranks by known + carried.
    function trendSeries(drivers, range, { includeCarried = false } = {}) {
        const carried = includeCarried ? carriedOverCounts(drivers) : null;
        const chronological = [...drivers]
            .sort((a, b) => compareVersions(a.version, b.version))
            .map(d => {
                const statuses = d.bugs.map(b => bugStatus(b, d.version));
                const count = status => statuses.filter(s => s === status).length;
                const fixedLater = count('fixed-later');
                const pending = count('pending');
                const item = {
                    version: d.version,
                    known: fixedLater + pending,
                    fixedLater,
                    pending,
                    fixed: count('fixed'),
                };
                if (carried) item.carried = carried.get(d.version);
                return item;
            });

        if (range === 'recent') return chronological.slice(-20);
        if (range === 'worst') {
            const weight = s => s.known + (s.carried || 0);
            return [...chronological]
                .sort((a, b) => weight(b) - weight(a))
                .slice(0, 15)
                .sort((a, b) => compareVersions(a.version, b.version));
        }
        return chronological;
    }

    // Drivers that have a release date, oldest first, with the same counts as
    // trendSeries(). Used by the timeline view.
    function timelineSeries(drivers, options) {
        const dates = new Map(drivers.map(d => [d.version, d.release_date]));
        return trendSeries(drivers.filter(d => d.release_date), 'all', options)
            .map(item => ({ ...item, date: dates.get(item.version) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    // Consecutive launch events of the same GPU family, merged into one band.
    function launchBands(events) {
        const bands = [];
        [...events].sort((a, b) => a.date.localeCompare(b.date)).forEach(event => {
            const last = bands[bands.length - 1];
            if (last && last.family === event.family) {
                last.end = event.date;
                last.events.push(event);
            } else {
                bands.push({ family: event.family, start: event.date, end: event.date, events: [event] });
            }
        });
        return bands;
    }

    // driver version -> GPU names it launched, e.g. "572.16" -> ["GeForce RTX 5090", ...]
    function launchesByDriver(events) {
        const map = new Map();
        events.forEach(e => map.set(e.driver, [...(map.get(e.driver) || []), ...e.gpus]));
        return map;
    }

    function daysBetween(from, to) {
        return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
    }

    // Page numbers to show, with '...' for gaps. Never more than 7 entries.
    function paginationPages(currentPage, totalPages) {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
        if (currentPage >= totalPages - 3) {
            return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        }
        return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
    }

    const lib = {
        CHANNEL_LABELS,
        escapeHTML,
        highlightText,
        formatVersion,
        compareVersions,
        bugStatus,
        fixedInVersion,
        knownIssueCount,
        driverBugs,
        bugMatchesQuery,
        visibleBugs,
        filterAndSortDrivers,
        summaryStats,
        latestDriver,
        neighbours,
        carriedOverBugs,
        withEarlierFixes,
        withRelisted,
        asListed,
        fixedElsewhere,
        openBugs,
        bugHistory,
        carriedOverCounts,
        trendSeries,
        timelineSeries,
        launchBands,
        launchesByDriver,
        daysBetween,
        paginationPages,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = lib;
    } else {
        root.NvidiaWatch = lib;
    }
})(this);
