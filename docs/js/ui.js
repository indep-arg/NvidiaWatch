// HTML pieces shared by the views. Everything that ends up in the page goes
// through esc() or lib.highlightText(), which escape it.
const lib = window.NvidiaWatch;

export const esc = lib.escapeHTML;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-09-22" -> "Sep 22, 2026", without going through Date (time zones).
export function longDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function channels(driver) {
    return (driver.channels || []).map(c => lib.CHANNEL_LABELS[c] || c).join(' + ');
}

export const driverHref = version => `?driver=${encodeURIComponent(version)}`;

// The raw drivers, so notes can link versions and spot related entries.
let allDrivers = [];
let tracked = new Set();
export function setDrivers(drivers) {
    allDrivers = drivers;
    tracked = new Set(drivers.map(d => d.version));
}

// A version as a link to its driver page, or plain text when it isn't tracked.
export function versionLink(version) {
    return tracked.has(version) ? `<a href="${driverHref(version)}" data-nav>${esc(version)}</a>` : esc(version);
}
export const bugHref = id => `?bug=${encodeURIComponent(id)}`;

// Builds a "?a=1&b=2" link, dropping empty and default values.
export function query(params) {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v === true ? '1' : String(v));
    });
    const s = p.toString();
    return s ? `?${s}` : './';
}

const MARKS = {
    fixed: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--fixed-fill)"/><path d="M4.5 8.3l2.3 2.2 4.7-4.8" stroke="#fff" stroke-width="1.8" fill="none"/></svg>',
    'fixed-later': '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--later-fill)" stroke-width="2"/><path d="M5 8h5.5M8.5 5.5L11 8l-2.5 2.5" stroke="var(--later-fill)" stroke-width="1.8" fill="none"/></svg>',
    pending: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="var(--open-fill)" stroke-width="2.4"/></svg>',
    carried: '<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--later-fill)" stroke-width="2" stroke-dasharray="3 2.2"/></svg>',
};

export const mark = status => MARKS[status];

// What a bug's state means in words, seen from the driver it's listed under.
// Fixes outside the driver keep their wording from the data:
// "Fixed (OTA profile update)" -> "Fixed outside the driver: OTA profile update".
export function statusText(bug, version) {
    const status = lib.bugStatus(bug, version);
    if (status === 'fixed') return 'Fixed in this driver';
    if (status === 'pending') return 'Still open';
    const to = lib.fixedInVersion(bug);
    if (to) return `Fixed in ${to}`;
    const how = /^Fixed \((.+)\)$/.exec(bug.fixed_in);
    if (how) return `Fixed outside the driver: ${how[1]}`;
    if (/^Fixed External\s*\?$/.test(bug.fixed_in)) return 'Fixed outside the driver (unconfirmed)';
    if (bug.fixed_in === 'Fixed External') return 'Fixed outside the driver';
    return bug.fixed_in;
}

// statusText() as HTML, with the fixing driver linked.
export function statusHTML(bug, version) {
    const to = lib.fixedInVersion(bug);
    if (lib.bugStatus(bug, version) === 'fixed-later' && to) return `Fixed in ${versionLink(to)}`;
    return esc(statusText(bug, version));
}

// The line under a bug (HTML), only when the mark alone doesn't say it:
// where a known issue was fixed, which driver listed a fix first, or another
// entry with the same ID that was fixed.
export function statusNote(bug, version) {
    const status = lib.bugStatus(bug, version);
    if (bug.since) {
        const since = `Listed since ${versionLink(bug.since)}`;
        return status === 'fixed-later' ? `${since} · ${statusHTML(bug, version)}` : since;
    }
    if (status === 'fixed-later') return statusHTML(bug, version);
    if (status === 'fixed' && bug.listedIn) return `Listed as a known issue in ${versionLink(bug.listedIn)}`;
    if (status === 'pending') {
        const other = lib.fixedElsewhere(allDrivers, bug, version);
        if (other) return `NVIDIA listed the same bug ID as fixed in ${versionLink(other.to)}`;
    }
    return '';
}

export function idsHTML(bug, query = '') {
    if (!bug.ids || !bug.ids.length) return '<span class="bug-ids"></span>';
    const idQuery = query.replace(/^#/, '');
    const links = bug.ids.map(id => `<a href="${bugHref(id)}" data-nav aria-label="Bug ${esc(id)} history">#${lib.highlightText(id, idQuery)}</a>`);
    return `<span class="bug-ids">${links.join('')}</span>`;
}

// One row of a bug list. `sub` is HTML shown under the description; build it
// with esc() and versionLink().
export function bugItem(bug, status, { sub = '', query = '' } = {}) {
    const label = { fixed: 'Fixed in this driver', 'fixed-later': 'Known issue, fixed later', pending: 'Known issue, still open', carried: 'Carried over' }[status];
    return `<li>${mark(status)}<div><span class="sr-only">${label}: </span><div class="bug-desc">${lib.highlightText(bug.description, query)}</div>${sub ? `<div class="bug-sub">${sub}</div>` : ''}</div>${idsHTML(bug, query)}</li>`;
}

export function bugList(items) {
    return `<ul class="bug-list">${items.join('')}</ul>`;
}

export function pagination(current, total, hrefFor) {
    if (total <= 1) return '';
    const pages = lib.paginationPages(current, total).map(p => {
        if (p === '...') return '<span aria-hidden="true">...</span>';
        return p === current
            ? `<span aria-current="page">${p}</span>`
            : `<a href="${hrefFor(p)}" data-nav aria-label="Page ${p}">${p}</a>`;
    });
    return `<nav class="pagination" aria-label="Pages">${pages.join('')}</nav>`;
}

// Links a driver offers: release notes, NVIDIA's feedback thread, Reddit.
export function driverLinks(driver) {
    const links = [
        [driver.release_notes, 'Release notes'],
        [driver.feedback_thread, 'Feedback thread'],
        [driver.reddit_thread, 'Reddit discussion'],
    ].filter(([url]) => url);
    return links.map(([url, text]) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`).join('');
}
