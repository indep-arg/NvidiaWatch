// Latest drivers first: what the newest Game Ready fixed, what it still has,
// the newest Studio driver and the totals.
import { esc, longDate, channels, driverHref, bugItem, bugList, mark, statusNote, driverLinks } from '../ui.js';
import { renderChart, legendHTML } from '../chart.js';

const lib = window.NvidiaWatch;

function countsHTML(driver) {
    const statuses = driver.bugs.map(b => lib.bugStatus(b, driver.version));
    const n = s => statuses.filter(x => x === s).length;
    return `<ul class="counts">
        <li>${mark('fixed')} ${n('fixed')} fixed</li>
        <li>${mark('fixed-later')} ${n('fixed-later')} fixed later</li>
        <li>${mark('pending')} ${n('pending')} still open</li>
    </ul>`;
}

export function render(main, { drivers, listed, events, navigate }) {
    if (!drivers.length) {
        main.innerHTML = '<h1 class="page-title">No drivers yet</h1>';
        return '';
    }
    const latest = lib.latestDriver(listed, 'game-ready') || lib.latestDriver(listed);
    const studio = lib.latestDriver(listed, 'studio');
    const { fixed, known } = lib.driverBugs(latest);
    const stats = lib.summaryStats(drivers);
    // Every fix a driver shipped, including known issues of earlier drivers.
    const fixes = listed.reduce((n, d) => n + lib.driverBugs(d).fixed.length, 0);
    // Open bugs of earlier drivers that the latest driver's notes don't repeat.
    const repeated = new Set(latest.still_open || []);
    const olderOpen = lib.openBugs(drivers).filter(o => o.driver.version !== latest.version && !o.bug.ids.some(id => repeated.has(id))).length;
    const launch = lib.launchesByDriver(events).get(latest.version);
    const recent = [...listed].sort((a, b) => lib.compareVersions(b.version, a.version)).slice(0, 8);

    main.innerHTML = `
        <div class="two-col">
            <div>
                <h1 class="kicker">Latest Game Ready driver</h1>
                <p class="version-big"><a href="${driverHref(latest.version)}" data-nav>${esc(latest.version)}</a></p>
                <p class="meta"><span>${longDate(latest.release_date)}</span><span>${esc(channels(latest))}</span>${launch ? `<span class="flag">Launch driver for ${esc(launch.join(', '))}</span>` : ''}</p>
                <p class="meta spaced">${driverLinks(latest)}</p>

                <section class="section" aria-labelledby="home-fixed">
                    <h2 class="section-title" id="home-fixed">Fixed in this driver <small>${fixed.length}</small></h2>
                    ${fixed.length ? bugList(fixed.map(b => bugItem(b, 'fixed', { sub: statusNote(b, latest.version) }))) : '<p class="empty">No fixes listed.</p>'}
                </section>
                <section class="section" aria-labelledby="home-known">
                    <h2 class="section-title" id="home-known">Known issues <small>${known.length}</small></h2>
                    ${known.length
                        ? bugList(known.map(b => bugItem(b, lib.bugStatus(b, latest.version), { sub: statusNote(b, latest.version) })))
                        : '<p class="empty">NVIDIA listed no known issues for this driver.</p>'}
                    <p class="explain spaced">Also ${olderOpen} known issue${olderOpen === 1 ? '' : 's'} from earlier drivers with no fix logged yet that this driver's notes don't mention. <a href="?view=bugs" data-nav>See them</a>.</p>
                </section>
            </div>
            <aside aria-label="Overview">
                <div class="side-box">
                    <h2>In numbers</h2>
                    <dl class="figures">
                        <dt>${stats.drivers}</dt><dd>drivers tracked</dd>
                        <dt>${stats.known}</dt><dd>known issues NVIDIA listed</dd>
                        <dt>${stats.fixedLaterRate}%</dt><dd>of them fixed later</dd>
                        <dt>${stats.pending}</dt><dd>still open</dd>
                        <dt>${fixes}</dt><dd>fixes across all drivers</dd>
                    </dl>
                </div>
                ${studio ? `<div class="side-box">
                    <h2>Latest Studio driver</h2>
                    <p class="version-mid"><a href="${driverHref(studio.version)}" data-nav>${esc(studio.version)}</a></p>
                    <p class="quiet tight">${longDate(studio.release_date)} · ${esc(channels(studio))}</p>
                    ${countsHTML(studio)}
                </div>` : ''}
            </aside>
        </div>

        <div class="lower">
            <section aria-labelledby="home-recent">
                <h2 class="section-title" id="home-recent">Recent drivers</h2>
                <table class="data-table">
                    <thead><tr><th scope="col">Version</th><th scope="col">Released</th><th scope="col" class="hide-narrow">Channel</th><th scope="col" class="num">Fixed</th><th scope="col" class="num">Known issues</th></tr></thead>
                    <tbody>${recent.map(d => {
                        const split = lib.driverBugs(d);
                        const open = split.known.filter(b => b.fixed_in === null).length;
                        return `<tr data-href="${driverHref(d.version)}"><td class="version"><a href="${driverHref(d.version)}" data-nav>${esc(d.version)}</a></td><td class="date">${esc(d.release_date || '')}</td><td class="quiet hide-narrow">${esc(channels(d))}</td><td class="num">${split.fixed.length}</td><td class="num">${split.known.length}${open ? ` <span class="quiet">(${open} open)</span>` : ''}</td></tr>`;
                    }).join('')}</tbody>
                </table>
                <p class="count"><a href="?view=drivers" data-nav>All ${drivers.length} drivers</a></p>
            </section>
            <section aria-labelledby="home-chart">
                <h2 class="section-title" id="home-chart">Last 12 drivers</h2>
                ${legendHTML()}
                <div id="home-chart-box"></div>
                <p class="count"><a href="?view=trends" data-nav>All trends</a></p>
            </section>
        </div>`;

    renderChart(main.querySelector('#home-chart-box'), lib.trendSeries(listed, 'recent').slice(-12), {
        height: 220,
        label: 'Known issues and fixes for the last 12 drivers',
        onSelect: version => navigate(driverHref(version)),
    });
    return '';
}
