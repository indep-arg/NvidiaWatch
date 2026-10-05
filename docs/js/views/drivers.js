// Every driver, with search, status, channel and sort. A plain table when
// nothing is filtered; matching bugs grouped by driver otherwise.
import { esc, longDate, channels, driverHref, bugItem, bugList, statusNote, pagination, query } from '../ui.js';

const lib = window.NvidiaWatch;
const FILTERS = [['all', 'All'], ['known', 'Known issues'], ['pending', 'Still open'], ['fixed', 'Fixed here']];
const SORTS = [['version-desc', 'Newest first'], ['version-asc', 'Oldest first'], ['bugs-desc', 'Most known issues'], ['bugs-asc', 'Fewest known issues']];
const CHANNELS = [['all', 'All'], ['game-ready', 'Game Ready'], ['studio', 'Studio']];
const ROWS_PER_PAGE = 20;
const GROUPS_PER_PAGE = 10;

function readState(params) {
    const pick = (key, options, fallback) => (options.some(([v]) => v === params.get(key)) ? params.get(key) : fallback);
    return {
        q: (params.get('q') || '').trim(),
        filter: pick('filter', FILTERS, 'all'),
        sort: pick('sort', SORTS, 'version-desc'),
        channel: pick('channel', CHANNELS, 'all'),
        page: Math.max(1, parseInt(params.get('page'), 10) || 1),
    };
}

const hrefFor = s => query({ view: 'drivers', q: s.q, filter: s.filter !== 'all' && s.filter, sort: s.sort !== 'version-desc' && s.sort, channel: s.channel !== 'all' && s.channel, page: s.page > 1 && s.page });

export function render(main, { listed: drivers, params }) {
    const state = readState(params);
    const carried = lib.carriedOverCounts(drivers);
    const options = (list, current) => list.map(([v, t]) => `<option value="${v}"${v === current ? ' selected' : ''}>${t}</option>`).join('');

    main.innerHTML = `
        <h1 class="page-title">Drivers</h1>
        <div class="controls">
            <label class="control control-search">Search
                <input type="search" id="drivers-q" value="${esc(state.q)}" placeholder="Game, app, bug ID or driver version" autocomplete="off">
            </label>
            <div class="control control-show"><span id="show-label">Show</span>
                <div class="segmented" role="group" aria-labelledby="show-label">${FILTERS.map(([v, t]) => `<button type="button" data-filter="${v}" aria-pressed="${v === state.filter}">${t}</button>`).join('')}</div>
            </div>
            <label class="control">Channel<select id="drivers-channel">${options(CHANNELS, state.channel)}</select></label>
            <label class="control">Sort<select id="drivers-sort">${options(SORTS, state.sort)}</select></label>
        </div>
        <p class="count" id="drivers-count" aria-live="polite"></p>
        <div id="drivers-results"></div>`;

    const results = main.querySelector('#drivers-results');
    const count = main.querySelector('#drivers-count');

    function update() {
        const q = state.q.toLowerCase();
        const list = lib.filterAndSortDrivers(drivers, { query: q, filter: state.filter, sort: state.sort, channel: state.channel });
        const grouped = q !== '' || state.filter !== 'all';
        const perPage = grouped ? GROUPS_PER_PAGE : ROWS_PER_PAGE;
        const pages = Math.max(1, Math.ceil(list.length / perPage));
        state.page = Math.min(state.page, pages);
        const shown = list.slice((state.page - 1) * perPage, state.page * perPage);

        count.textContent = `${list.length} driver${list.length === 1 ? '' : 's'}${q ? ` matching "${state.q}"` : ''}`;
        if (!list.length) {
            results.innerHTML = '<p class="empty">Nothing matches. Try another word, a bug ID or a version.</p>';
        } else if (grouped) {
            results.innerHTML = shown.map(d => {
                // A version match shows the whole driver; otherwise only the matching bugs.
                const versionHit = q && `driver ${lib.formatVersion(d.version)}`.toLowerCase().includes(q);
                const bugs = lib.visibleBugs(d, state.filter, versionHit ? '' : q);
                return `<section class="group" aria-label="Driver ${esc(d.version)}">
                    <div class="group-head"><a class="version" href="${driverHref(d.version)}" data-nav>${esc(d.version)}</a><span class="quiet">${longDate(d.release_date)} · ${esc(channels(d))}</span></div>
                    ${bugs.length ? bugList(bugs.map(b => bugItem(b, lib.bugStatus(b, d.version), { sub: statusNote(b, d.version), query: q }))) : '<p class="empty">No bugs listed.</p>'}
                </section>`;
            }).join('');
        } else {
            results.innerHTML = `<table class="data-table">
                <thead><tr><th scope="col">Version</th><th scope="col">Released</th><th scope="col" class="hide-narrow">Channel</th><th scope="col" class="num">Fixed</th><th scope="col" class="num">Known issues</th><th scope="col" class="num hide-narrow">Carried over</th></tr></thead>
                <tbody>${shown.map(d => {
                    const split = lib.driverBugs(d);
                    const open = split.known.filter(b => b.fixed_in === null).length;
                    return `<tr data-href="${driverHref(d.version)}"><td class="version"><a href="${driverHref(d.version)}" data-nav>${esc(d.version)}</a></td><td class="date">${esc(d.release_date || '')}</td><td class="quiet hide-narrow">${esc(channels(d))}</td><td class="num">${split.fixed.length}</td><td class="num">${split.known.length}${open ? ` <span class="quiet">(${open} open)</span>` : ''}</td><td class="num hide-narrow">${carried.get(d.version)}</td></tr>`;
                }).join('')}</tbody></table>`;
        }
        results.insertAdjacentHTML('beforeend', pagination(state.page, pages, page => hrefFor({ ...state, page })));
        window.history.replaceState(null, '', `${window.location.pathname}${hrefFor(state).replace(/^\.\/$/, '')}`);
    }

    let timer;
    main.querySelector('#drivers-q').addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; update(); }, 150);
    });
    main.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        state.page = 1;
        main.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        update();
    }));
    main.querySelector('#drivers-channel').addEventListener('change', e => { state.channel = e.target.value; state.page = 1; update(); });
    main.querySelector('#drivers-sort').addEventListener('change', e => { state.sort = e.target.value; state.page = 1; update(); });

    update();
    return 'Drivers';
}
