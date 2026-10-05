// Loads the data, picks the view from the URL and keeps navigation inside the
// page.
import * as home from './views/home.js';
import * as driversView from './views/drivers.js';
import * as driverView from './views/driver.js';
import * as bugsView from './views/bugs.js';
import * as bugView from './views/bug.js';
import * as trendsView from './views/trends.js';
import * as aboutView from './views/about.js';
import { setDrivers } from './ui.js';

const main = document.getElementById('main');
// listed: the drivers as their pages show them, see lib.asListed().
const state = { drivers: [], listed: [], events: [] };

const VIEWS = { home, drivers: driversView, driver: driverView, bugs: bugsView, bug: bugView, trends: trendsView, about: aboutView };
const SECTION = { home: 'home', drivers: 'drivers', driver: 'drivers', bugs: 'bugs', bug: 'bugs', trends: 'trends', about: 'about' };

function routeFor(params) {
    if (params.has('driver')) return 'driver';
    if (params.has('bug')) return 'bug';
    const view = params.get('view');
    if (view in VIEWS && view !== 'driver' && view !== 'bug') return view;
    return 'home';
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// moveFocus: a new page, so focus and scroll go to the top. animate: fade the
// view in; off when only a filter changed.
function render({ moveFocus = false, animate = true } = {}) {
    const params = new URLSearchParams(window.location.search);
    const name = routeFor(params);
    const title = VIEWS[name].render(main, { ...state, params, navigate });
    document.title = title ? `${title} | NvidiaWatch` : 'NvidiaWatch | NVIDIA driver known issues';
    document.querySelectorAll('.site-nav a').forEach(a => {
        if (a.dataset.section === SECTION[name]) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
    if (moveFocus) {
        main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    }
    document.documentElement.classList.add('ready');
    if (animate && !reducedMotion.matches && main.animate) {
        main.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
    }
}

function navigate(href, { replace = false } = {}) {
    const url = new URL(href, window.location.href);
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
    render({ moveFocus: !replace, animate: !replace });
}

document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target.closest('a[data-nav]');
    if (link) {
        e.preventDefault();
        navigate(link.getAttribute('href'));
        return;
    }
    // A click anywhere on a table row opens its driver, unless it was on
    // another link or the end of selecting text.
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a') && !String(window.getSelection())) navigate(row.dataset.href);
});

window.addEventListener('popstate', () => render());

// Theme: dark by default, light only when someone picks it.
const themeButton = document.getElementById('theme-toggle');
function syncThemeButton() {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    themeButton.textContent = light ? 'Dark theme' : 'Light theme';
}
let themeTimer;
themeButton.addEventListener('click', () => {
    const root = document.documentElement;
    const light = root.getAttribute('data-theme') !== 'light';
    root.classList.add('theme-switching');
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => root.classList.remove('theme-switching'), 300);
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    try { window.localStorage.setItem('theme', light ? 'light' : 'dark'); } catch { /* not saved */ }
    syncThemeButton();
});
syncThemeButton();

async function load() {
    try {
        const response = await fetch('drivers.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state.drivers = await response.json();
        state.listed = window.NvidiaWatch.asListed(state.drivers);
        setDrivers(state.drivers);
    } catch (error) {
        document.documentElement.classList.add('ready');
        main.innerHTML = '<h1 class="page-title">Couldn\'t load the drivers</h1><p>Refresh the page to try again. The data is also on <a href="https://github.com/indep-arg/NvidiaWatch">GitHub</a>.</p>';
        console.error(error);
        return;
    }
    // Launch markers are extra; the site works without them.
    try {
        const response = await fetch('events.json');
        if (response.ok) state.events = await response.json();
    } catch { /* no launch markers */ }

    render();
}

load();
