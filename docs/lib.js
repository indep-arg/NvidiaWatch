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

    function knownIssueCount(driver) {
        return driver.bugs.filter(bug => bugStatus(bug, driver.version) !== 'fixed').length;
    }

    function matchesStatusFilter(bug, filter) {
        if (filter === 'pending') return bug.fixed_in === null;
        if (filter === 'fixed') return bug.fixed_in !== null;
        return true;
    }

    // `query` is expected lowercased and trimmed. IDs match with or without
    // the leading "#" the cards show.
    function bugMatchesQuery(bug, query) {
        if (!query) return true;
        const idQuery = query.replace(/^#/, '');
        return (bug.description || '').toLowerCase().includes(query) ||
            (bug.fixed_in || 'Pending').toLowerCase().includes(query) ||
            (idQuery !== '' && (bug.ids || []).some(id => id.includes(idQuery)));
    }

    // Bugs a card lists under the active status filter and search.
    function visibleBugs(driver, filter, query) {
        return driver.bugs.filter(bug => matchesStatusFilter(bug, filter) && bugMatchesQuery(bug, query));
    }

    // A driver is kept if its version matches the search, or if one of its
    // bugs matches both the status filter and the search. With a status
    // filter set, drivers with no bugs of that status are dropped.
    function filterAndSortDrivers(drivers, { query = '', filter = 'all', sort = 'version-desc' } = {}) {
        const result = drivers.filter(driver => {
            const bugsMatchingStatus = driver.bugs.filter(bug => matchesStatusFilter(bug, filter));
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

    function computeStats(drivers) {
        let totalBugs = 0;
        let pending = 0;
        drivers.forEach(d => {
            d.bugs.forEach(b => {
                totalBugs++;
                if (b.fixed_in === null) pending++;
            });
        });
        return {
            totalDrivers: drivers.length,
            totalBugs,
            fixedRate: totalBugs > 0 ? Math.round(((totalBugs - pending) / totalBugs) * 100) : 0,
            pending,
        };
    }

    // 'recent': the 20 newest versions. 'worst': the 15 with the most known
    // issues, put back in version order. 'all': everything.
    function trendSeries(drivers, range) {
        const chronological = [...drivers]
            .sort((a, b) => compareVersions(a.version, b.version))
            .map(d => {
                const statuses = d.bugs.map(b => bugStatus(b, d.version));
                const count = status => statuses.filter(s => s === status).length;
                const fixedLater = count('fixed-later');
                const pending = count('pending');
                return {
                    version: d.version,
                    known: fixedLater + pending,
                    fixedLater,
                    pending,
                    fixed: count('fixed'),
                };
            });

        if (range === 'recent') return chronological.slice(-20);
        if (range === 'worst') {
            return [...chronological]
                .sort((a, b) => b.known - a.known)
                .slice(0, 15)
                .sort((a, b) => compareVersions(a.version, b.version));
        }
        return chronological;
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
        knownIssueCount,
        bugMatchesQuery,
        visibleBugs,
        filterAndSortDrivers,
        computeStats,
        trendSeries,
        paginationPages,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = lib;
    } else {
        root.NvidiaWatch = lib;
    }
})(this);
