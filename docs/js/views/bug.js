// One NVIDIA bug ID across drivers: where it was listed, which drivers
// carried it and where it was fixed.
import { esc, driverHref, mark, statusText, statusHTML, versionLink } from '../ui.js';

const lib = window.NvidiaWatch;
const MAX_TRACK = 9;

export function render(main, { drivers, params }) {
    const id = (params.get('bug') || '').replace(/^#/, '');
    const { mentions, relisted, carried } = lib.bugHistory(drivers, id);
    if (!mentions.length) {
        main.innerHTML = `<p class="crumb"><a href="?view=bugs" data-nav>Bugs</a></p>
            <h1 class="page-title">No bug #${esc(id)} in the data</h1>
            <p><a href="?view=bugs" data-nav>Search the bugs</a> by ID or by a word from the description.</p>`;
        return 'Bug not found';
    }

    const byVersion = new Map(drivers.map(d => [d.version, d]));
    const last = mentions[mentions.length - 1];
    const fixVersion = lib.fixedInVersion(last.bug);

    // Every driver the data ties to this bug, oldest first.
    const steps = new Map();
    mentions.forEach(m => steps.set(m.driver.version, {
        driver: m.driver,
        status: m.status,
        what: m.status === 'fixed' ? 'Listed as fixed in this driver' : `Listed as a known issue (${statusText(m.bug, m.driver.version).toLowerCase()})`,
    }));
    relisted.forEach(d => {
        const from = [...mentions].reverse().find(m => lib.compareVersions(m.driver.version, d.version) < 0) || mentions[0];
        steps.set(d.version, { driver: d, status: lib.bugStatus(from.bug, d.version), relisted: true, what: 'Listed again as an open issue' });
    });
    carried.forEach(d => steps.set(d.version, { driver: d, status: 'carried', what: 'Carried over: listed earlier, fixed later' }));
    mentions.forEach(m => {
        const to = lib.fixedInVersion(m.bug);
        if (to && to !== m.driver.version && byVersion.has(to) && !steps.has(to)) {
            steps.set(to, { driver: byVersion.get(to), status: 'fixed', what: 'Fixed in this driver' });
        }
    });
    const rows = [...steps.values()].sort((a, b) => lib.compareVersions(a.driver.version, b.driver.version));

    let summary;
    if (last.status === 'pending') {
        const other = lib.fixedElsewhere(drivers, last.bug, last.driver.version);
        summary = `${mark('pending')} Still open${other ? `, but NVIDIA listed the same ID as fixed in ${versionLink(other.to)}` : ''}`;
    } else if (last.status === 'fixed') {
        summary = `${mark('fixed')} Fixed in ${versionLink(last.driver.version)}`;
    } else {
        summary = `${mark('fixed')} ${statusHTML(last.bug, last.driver.version)}`;
    }

    let span = '';
    const fixDriver = fixVersion && byVersion.get(fixVersion);
    const present = carried.length + relisted.length + 1;
    if (mentions.length === 1 && fixDriver && fixVersion !== last.driver.version && last.driver.release_date && fixDriver.release_date) {
        const days = lib.daysBetween(last.driver.release_date, fixDriver.release_date);
        span = `<span>Present in ${present} driver${present === 1 ? '' : 's'} over ${days} days</span>`;
    } else if (last.status === 'pending' && relisted.length) {
        const newest = relisted[relisted.length - 1];
        if (last.driver.release_date && newest.release_date) {
            span = `<span>Listed in ${present} drivers over ${lib.daysBetween(last.driver.release_date, newest.release_date)} days</span>`;
        }
    }

    const track = rows.length > 1 && rows.length <= MAX_TRACK ? `
        <div class="track" aria-hidden="true"><ol>${rows.map((r, i) => `<li style="--i: ${i}">
            <span class="dot">${mark(r.status)}</span>
            <span class="version">${esc(r.driver.version)}</span>
            <span class="date">${esc(r.driver.release_date || '')}</span>
            <span>${r.relisted ? 'Listed again' : r.status === 'carried' ? 'Still present' : r.status === 'fixed' ? 'Fixed' : 'Listed'}</span>
        </li>`).join('')}</ol></div>` : '';

    main.innerHTML = `
        <p class="crumb"><a href="?view=bugs" data-nav>Bugs</a> / #${esc(id)}</p>
        <h1 class="page-title page-title-wide">${esc(last.bug.description)}</h1>
        <p class="meta spaced"><span class="mono">#${esc(id)}</span><span class="inline-status">${summary}</span>${span}</p>
        ${track}
        <section class="section" aria-labelledby="bug-where">
            <h2 class="section-title" id="bug-where">Where it appears</h2>
            <table class="data-table">
                <thead><tr><th scope="col">Driver</th><th scope="col">Released</th><th scope="col">What the data says</th></tr></thead>
                <tbody>${rows.map(r => `<tr><td class="version"><a href="${driverHref(r.driver.version)}" data-nav>${esc(r.driver.version)}</a></td><td class="date">${esc(r.driver.release_date || '')}</td><td>${esc(r.what)}</td></tr>`).join('')}</tbody>
            </table>
            ${fixVersion && !byVersion.has(fixVersion) ? `<p class="explain spaced">Fixed in ${esc(fixVersion)}, a driver that isn't tracked here.</p>` : ''}
            ${mentions.length > 1 ? '<p class="explain spaced">NVIDIA listed this ID under more than one driver, for example when a bug came back.</p>' : ''}
        </section>`;
    return `Bug #${id}`;
}

