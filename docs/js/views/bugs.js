// Bugs across all drivers: the ones still open, or a search by ID or words.
import { esc, longDate, bugHref, bugItem, bugList, statusNote, statusHTML, versionLink, query } from '../ui.js';

const lib = window.NvidiaWatch;
const MAX_RESULTS = 100;

export function render(main, { drivers, params }) {
    let q = (params.get('q') || '').trim();

    main.innerHTML = `
        <h1 class="page-title">Bugs</h1>
        <div class="controls controls-single">
            <label class="control control-search">Search by bug ID or words
                <input type="search" id="bugs-q" value="${esc(q)}" placeholder="e.g. 4063597 or Cyberpunk" autocomplete="off">
            </label>
        </div>
        <p class="count" id="bugs-count" aria-live="polite"></p>
        <div id="bugs-results"></div>`;

    const results = main.querySelector('#bugs-results');
    const count = main.querySelector('#bugs-count');
    const newestFirst = [...drivers].sort((a, b) => lib.compareVersions(b.version, a.version));
    // The newest driver whose notes still list a bug as open.
    const lastListed = bug => newestFirst.find(d => (d.still_open || []).some(id => bug.ids.includes(id)));

    function update() {
        const needle = q.toLowerCase();
        if (!needle) {
            const open = lib.openBugs(drivers);
            count.textContent = `${open.length} bugs still open`;
            results.innerHTML = `<p class="explain">Known issues with no fix logged yet, newest first.</p>
                ${bugList(open.map(o => bugItem(o.bug, 'pending', {
                    sub: [
                        `First listed in ${versionLink(o.driver.version)} (${longDate(o.driver.release_date)})`,
                        lastListed(o.bug) && `last listed in ${versionLink(lastListed(o.bug).version)}`,
                        statusNote(o.bug, o.driver.version),
                    ].filter(Boolean).join(' · '),
                })))}`;
        } else {
            const hits = newestFirst.flatMap(d => d.bugs.filter(b => lib.bugMatchesQuery(b, needle)).map(bug => ({ driver: d, bug })));
            const id = needle.replace(/^#/, '');
            const exact = hits.some(h => h.bug.ids.includes(id));
            count.textContent = `${hits.length} bug${hits.length === 1 ? '' : 's'} matching "${q}"${hits.length > MAX_RESULTS ? `, showing the first ${MAX_RESULTS}` : ''}`;
            results.innerHTML = (exact ? `<p><a href="${bugHref(id)}" data-nav>History of bug #${esc(id)}</a></p>` : '')
                + (hits.length
                    ? bugList(hits.slice(0, MAX_RESULTS).map(h => bugItem(h.bug, lib.bugStatus(h.bug, h.driver.version), {
                        sub: [`${versionLink(h.driver.version)} · ${statusHTML(h.bug, h.driver.version)}`, lib.bugStatus(h.bug, h.driver.version) === 'pending' && statusNote(h.bug, h.driver.version)].filter(Boolean).join(' · '),
                        query: needle,
                    })))
                    : '<p class="empty">Nothing matches.</p>');
        }
        window.history.replaceState(null, '', `${window.location.pathname}${query({ view: 'bugs', q })}`);
    }

    let timer;
    main.querySelector('#bugs-q').addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { q = e.target.value.trim(); update(); }, 150);
    });
    update();
    return 'Bugs';
}

