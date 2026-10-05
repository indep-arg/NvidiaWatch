// One driver: what it fixed, the known issues NVIDIA listed for it, and the
// ones it carried over from earlier drivers.
import { esc, longDate, channels, driverHref, bugItem, bugList, statusNote, driverLinks, versionLink } from '../ui.js';

const lib = window.NvidiaWatch;

export function render(main, { drivers, listed, events, params }) {
    const version = params.get('driver');
    const driver = listed.find(d => d.version === version);
    if (!driver) {
        main.innerHTML = `<p class="crumb"><a href="?view=drivers" data-nav>Drivers</a></p>
            <h1 class="page-title">Driver ${esc(version)} isn't tracked</h1>
            <p>It may be a hotfix or a driver that isn't logged yet. <a href="?view=drivers" data-nav>Browse all drivers</a>.</p>`;
        return 'Driver not found';
    }

    const { fixed, known } = lib.driverBugs(driver);
    const carried = lib.carriedOverBugs(drivers, driver.version);
    const { previous, next } = lib.neighbours(drivers, driver.version);
    const launch = lib.launchesByDriver(events).get(driver.version);
    const links = driverLinks(driver);

    main.innerHTML = `
        <p class="crumb"><a href="?view=drivers" data-nav>Drivers</a> / ${esc(driver.version)}</p>
        <div class="two-col">
            <div>
                <h1 class="version-big">${esc(driver.version)}</h1>
                <p class="meta"><span>${longDate(driver.release_date)}</span><span>${esc(channels(driver))}</span>${launch ? `<span class="flag">Launch driver for ${esc(launch.join(', '))}</span>` : ''}</p>
                ${links ? `<p class="meta spaced">${links}</p>` : ''}

                <section class="section" aria-labelledby="driver-fixed">
                    <h2 class="section-title" id="driver-fixed">Fixed in this driver <small>${fixed.length}</small></h2>
                    ${fixed.length ? bugList(fixed.map(b => bugItem(b, 'fixed', { sub: statusNote(b, driver.version) }))) : '<p class="empty">No fixes listed.</p>'}
                </section>

                <section class="section" aria-labelledby="driver-known">
                    <h2 class="section-title" id="driver-known">Known issues <small>${known.length}</small></h2>
                    ${known.length
                        ? bugList(known.map(b => bugItem(b, lib.bugStatus(b, driver.version), { sub: statusNote(b, driver.version) })))
                        : '<p class="empty">NVIDIA listed no known issues for this driver.</p>'}
                </section>

                <section class="section" aria-labelledby="driver-carried">
                    <h2 class="section-title" id="driver-carried">Carried over from earlier drivers <small>${carried.length}</small></h2>
                    <p class="explain">Listed in an earlier driver and fixed after this one, so this driver had them too. <a href="?view=about" data-nav>How this works</a>.</p>
                    ${carried.length
                        ? bugList(carried.map(c => bugItem(c.bug, 'carried', { sub: `First listed in ${versionLink(c.from)} · fixed in ${versionLink(c.to)}` })))
                        : '<p class="empty">None.</p>'}
                </section>
            </div>
            <aside aria-label="Summary">
                <div class="side-box">
                    <h2>This driver</h2>
                    <dl class="figures">
                        <dt>${fixed.length}</dt><dd>fixed here</dd>
                        <dt>${known.length}</dt><dd>known issue${known.length === 1 ? '' : 's'}</dd>
                        <dt>${carried.length}</dt><dd>carried over from earlier drivers</dd>
                    </dl>
                </div>
                <nav class="side-box" aria-label="Nearby drivers">
                    <h2>Nearby</h2>
                    <p class="meta mono">
                        ${previous ? `<a href="${driverHref(previous.version)}" data-nav>Previous: ${esc(previous.version)}</a>` : '<span>Oldest tracked</span>'}
                        ${next ? `<a href="${driverHref(next.version)}" data-nav>Next: ${esc(next.version)}</a>` : '<span>Newest</span>'}
                    </p>
                </nav>
            </aside>
        </div>`;
    return `Driver ${driver.version}`;
}
