// Page state lives in the URL query string (q, page, filter, sort) so a shared
// link reopens the same view. The data itself is never modified after loading.
document.addEventListener('DOMContentLoaded', () => {
    const {
        CHANNEL_LABELS, escapeHTML, highlightText, formatVersion, compareVersions,
        bugStatus, visibleBugs, filterAndSortDrivers, computeStats, trendSeries, paginationPages,
        timelineSeries, launchBands, launchesByDriver, daysBetween,
    } = window.NvidiaWatch;

    const driverContainer = document.getElementById('driver-container');
    const statTotalDrivers = document.getElementById('stat-total-drivers');
    const statTotalBugs = document.getElementById('stat-total-bugs');
    const statFixedRate = document.getElementById('stat-fixed-rate');
    const statPending = document.getElementById('stat-pending');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const themeBtn = document.getElementById('theme-toggle');
    const viewModeBtn = document.getElementById('view-mode-toggle');
    const sortSelect = document.getElementById('sort-select');
    const statusChips = document.querySelectorAll('#status-filters .chip');
    const htmlEl = document.documentElement;
    const paginationContainer = document.querySelector('.pagination-container');
    const resultsStatus = document.getElementById('results-status');
    const trendsSection = document.getElementById('trends');
    const trendsChartSvg = document.getElementById('trends-chart');
    const trendsTooltip = document.getElementById('trends-tooltip');
    const trendsRangeChips = document.querySelectorAll('#trends-range .chip');
    const carriedToggle = document.getElementById('carried-toggle');

    const ITEMS_PER_PAGE = 9;
    const VALID_FILTERS = Array.from(statusChips, chip => chip.dataset.filter);
    const VALID_SORTS = Array.from(sortSelect.options, option => option.value);

    let allDrivers = [];
    let launchEvents = [];
    let launchByDriver = new Map();
    let filteredDrivers = [];
    let currentPage = 1;
    let currentFilter = 'all';
    let currentSort = 'version-desc';
    let trendsRange = 'all';
    let includeCarried = false;
    let searchDebounceTimer = null;
    let resizeDebounceTimer = null;
    let toastTimeout = null;

    function icon(name) {
        return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
    }

    // localStorage throws when site storage is blocked.
    function storageGet(key) {
        try { return localStorage.getItem(key); } catch { return null; }
    }
    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch { /* not persisted */ }
    }

    function searchQuery() {
        return searchInput.value.toLowerCase().trim();
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2500);
    }

    // navigator.clipboard only exists on secure origins (https, localhost).
    function copyText(text) {
        if (!navigator.clipboard) return Promise.reject(new Error('Clipboard API unavailable'));
        return navigator.clipboard.writeText(text);
    }

    // Search keystrokes and the initial load use replaceState so they don't
    // pile up history entries; page, filter and sort changes push one.
    function updateURL(replace = false, hash = window.location.hash) {
        const params = new URLSearchParams();
        if (searchInput.value) params.set('q', searchInput.value);
        if (currentPage > 1) params.set('page', currentPage);
        if (currentFilter !== 'all') params.set('filter', currentFilter);
        if (currentSort !== 'version-desc') params.set('sort', currentSort);
        const query = params.toString();
        const url = window.location.pathname + (query ? `?${query}` : '') + hash;
        if (replace) {
            history.replaceState(null, '', url);
        } else {
            history.pushState(null, '', url);
        }
    }

    // Unknown values fall back to the defaults.
    function loadStateFromURL() {
        const params = new URLSearchParams(window.location.search);
        searchInput.value = params.get('q') || '';
        searchClearBtn.classList.toggle('hidden', !searchInput.value);
        const parsedPage = parseInt(params.get('page'), 10);
        currentPage = (Number.isFinite(parsedPage) && parsedPage > 0) ? parsedPage : 1;
        const filter = params.get('filter');
        currentFilter = VALID_FILTERS.includes(filter) ? filter : 'all';
        updateChipUI();
        const sort = params.get('sort');
        currentSort = VALID_SORTS.includes(sort) ? sort : 'version-desc';
        sortSelect.value = currentSort;
    }

    function updateChipUI() {
        statusChips.forEach(chip => {
            const isActive = chip.dataset.filter === currentFilter;
            chip.classList.toggle('active', isActive);
            chip.setAttribute('aria-pressed', isActive);
        });
    }

    function setView(view) {
        htmlEl.setAttribute('data-view', view);
        viewModeBtn.setAttribute('aria-pressed', view === 'timeline');
        if (view === 'masonry') {
            driverContainer.classList.replace('grid-layout', 'masonry-layout');
        } else {
            driverContainer.classList.replace('masonry-layout', 'grid-layout');
        }
    }

    // data-theme is already applied by the inline script in <head>.
    themeBtn.setAttribute('aria-pressed', htmlEl.getAttribute('data-theme') === 'dark');
    setView(storageGet('view') === 'timeline' ? 'timeline' : 'masonry');

    themeBtn.addEventListener('click', () => {
        const newTheme = htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        htmlEl.setAttribute('data-theme', newTheme);
        themeBtn.setAttribute('aria-pressed', newTheme === 'dark');
        storageSet('theme', newTheme);
    });

    viewModeBtn.addEventListener('click', () => {
        const newView = htmlEl.getAttribute('data-view') === 'timeline' ? 'masonry' : 'timeline';
        setView(newView);
        storageSet('view', newView);
    });

    // The timeline still works without events.json, just without launch bands.
    const eventsRequest = fetch('events.json')
        .then(response => (response.ok ? response.json() : []))
        .catch(() => []);

    fetch('drivers.json')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => eventsRequest.then(events => [data, events]))
        .then(([data, events]) => {
            allDrivers = data;
            launchEvents = events;
            launchByDriver = launchesByDriver(events);
            const latest = data.reduce((a, b) => (compareVersions(b.version, a.version) > 0 ? b : a), data[0]);
            if (latest) {
                document.title = `NvidiaWatch | Latest Driver ${formatVersion(latest.version)}`;
            }
            loadStateFromURL();
            updateStats();
            renderTrendsChart();
            applyFiltersAndSort(false);
            const hash = window.location.hash;
            if (hash.startsWith('#driver-')) {
                const driverIndex = filteredDrivers.findIndex(d => d.version === hash.slice('#driver-'.length));
                if (driverIndex !== -1) currentPage = Math.floor(driverIndex / ITEMS_PER_PAGE) + 1;
            }
            renderDrivers();
            renderPagination();
            updateURL(true);
            scrollToDriverFromHash();
        })
        .catch(err => {
            console.error('Error loading data:', err);
            driverContainer.innerHTML = `
                <div class="no-results" role="status">
                    ${icon('alert-circle-outline')}
                    <p>Couldn't load driver data. Please try refreshing the page.</p>
                </div>
            `;
        });

    function updateStats() {
        const stats = computeStats(allDrivers);
        statTotalDrivers.textContent = stats.totalDrivers;
        statTotalBugs.textContent = stats.totalBugs;
        statFixedRate.textContent = `${stats.fixedRate}%`;
        statPending.textContent = stats.pending;
    }

    function rangeLabel(range) {
        if (range === 'recent') return 'last 20 versions';
        if (range === 'worst') return 'most affected versions';
        if (range === 'timeline') return 'all versions by release date';
        return 'all tracked versions';
    }

    function chartSeries(range) {
        const options = { includeCarried };
        return range === 'timeline' ? timelineSeries(allDrivers, options) : trendSeries(allDrivers, range, options);
    }

    function resetTrendsTooltip() {
        const count = chartSeries(trendsRange).length;
        trendsTooltip.textContent = `Showing ${rangeLabel(trendsRange)} (${count}). Hover or tap a bar for details.`;
    }

    // Clears search and filter first so the target driver is guaranteed to be
    // listed. One history entry, so a single Back returns to the chart.
    function goToDriver(version) {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        updateChipUI();
        applyFiltersAndSort(false);
        const idx = filteredDrivers.findIndex(d => d.version === version);
        if (idx !== -1) currentPage = Math.floor(idx / ITEMS_PER_PAGE) + 1;
        renderDrivers();
        renderPagination();
        updateURL(false, `#driver-${version}`);
        scrollToDriverFromHash();
    }

    function listNames(names) {
        return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    }

    // Known issues (fixed later, pending) go up from the baseline, the bugs a
    // driver fixed go down. Both sides share one scale. The timeline view
    // places each bar at its release date and shades GPU launch periods.
    function renderTrendsChart(range = trendsRange) {
        if (!trendsChartSvg || allDrivers.length === 0) return;
        const enteringTimeline = range === 'timeline' && trendsRange !== 'timeline';
        trendsRange = range;
        trendsSection.dataset.range = range;
        trendsSection.dataset.carried = includeCarried;
        trendsChartSvg.innerHTML = '';

        const timeline = range === 'timeline';
        const series = chartSeries(range);
        if (series.length === 0) return;

        const ns = 'http://www.w3.org/2000/svg';
        const containerWidth = trendsChartSvg.parentElement.clientWidth || 800;
        const height = 280;
        const padTop = timeline ? 40 : 8;
        const padBottom = timeline ? 26 : 8;
        const plotH = height - padTop - padBottom;

        // Bars keep a minimum width; when they don't fit, the SVG grows past
        // the container and the wrapper scrolls horizontally.
        let width, barW, hitW, barX, dateX;
        if (timeline) {
            const first = series[0].date;
            const span = Math.max(daysBetween(first, series[series.length - 1].date), 1);
            const edge = 16;
            // 1.6px per day keeps drivers released 4 days apart from overlapping.
            const pxPerDay = Math.max((containerWidth - 2 * edge) / span, 1.6);
            width = Math.max(containerWidth, span * pxPerDay + 2 * edge);
            barW = Math.min(8, Math.max(3, 4 * pxPerDay - 1.5));
            hitW = barW + 1.5;
            dateX = date => edge + daysBetween(first, date) * pxPerDay;
            barX = item => dateX(item.date) - barW / 2;
        } else {
            const minBarWidth = range === 'all' ? 6 : 22;
            const gap = range === 'all' ? 3.5 : 6;
            width = Math.max(containerWidth, series.length * (minBarWidth + gap));
            barW = Math.max(minBarWidth, (width - gap * (series.length - 1)) / series.length);
            hitW = barW + gap;
            barX = (_, i) => i * (barW + gap);
        }

        const maxUp = Math.max(...series.map(s => s.known + (s.carried || 0)), 1);
        const maxDown = Math.max(...series.map(s => s.fixed), 1);
        const unit = plotH / (maxUp + maxDown);
        const baseY = padTop + maxUp * unit;
        const segmentGap = 2;
        const baselineGap = 1;

        trendsChartSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        trendsChartSvg.setAttribute('preserveAspectRatio', 'none');
        trendsChartSvg.style.width = `${width}px`;
        trendsChartSvg.style.height = `${height}px`;

        const frag = document.createDocumentFragment();

        const svgEl = (name, attrs, parent = frag) => {
            const node = document.createElementNS(ns, name);
            Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
            parent.appendChild(node);
            return node;
        };
        const rect = (parent, x, y, w, h, className) =>
            svgEl('rect', { x, y, width: w, height: Math.max(1, h), class: className }, parent);

        if (timeline) {
            const firstYear = Number(series[0].date.slice(0, 4)) + 1;
            const lastYear = Number(series[series.length - 1].date.slice(0, 4));
            for (let year = firstYear; year <= lastYear; year++) {
                const x = dateX(`${year}-01-01`);
                svgEl('line', { x1: x, x2: x, y1: padTop, y2: height - padBottom, class: 'timeline-grid' });
                svgEl('text', { x: x + 4, y: height - 8, class: 'timeline-year' }).textContent = year;
            }

            launchBands(launchEvents).forEach(band => {
                const x0 = dateX(band.start) - 6;
                const x1 = dateX(band.end) + 6;
                svgEl('rect', { x: x0, y: 0, width: x1 - x0, height: height - padBottom, class: 'timeline-band' });
                svgEl('text', { x: x0 + 6, y: 14, class: 'timeline-band-label' }).textContent = `${band.family} launches`;
                band.events.forEach(event => {
                    const x = dateX(event.date);
                    const tick = svgEl('line', { x1: x, x2: x, y1: 22, y2: 32, class: 'timeline-tick' });
                    svgEl('title', {}, tick).textContent = `${listNames(event.gpus)}: launch driver ${event.driver} (${event.date})`;
                });
            });
        }

        series.forEach((item, i) => {
            const x = barX(item, i);
            const versionDisplay = formatVersion(item.version);
            const launched = launchByDriver.get(item.version);
            const when = timeline ? ` (${item.date})` : '';
            const detail = `${item.known} known issue${item.known === 1 ? '' : 's'} (${item.fixedLater} fixed later, ${item.pending} pending), ${item.fixed} bug${item.fixed === 1 ? '' : 's'} fixed in this driver`
                + (includeCarried ? `, plus ${item.carried} carried over from earlier drivers` : '')
                + (launched ? `. Launch driver for ${listNames(launched)}` : '');

            const g = svgEl('g', {
                class: 'trend-bar-group',
                tabindex: '0',
                role: 'button',
                'aria-label': `Driver ${versionDisplay}${when}: ${detail}. Jump to this driver.`,
            });

            // Invisible full-height hit area so thin bars are easy to hover and tap.
            rect(g, x - (hitW - barW) / 2, padTop, hitW, plotH, 'trend-bar-hit');

            let above = 0;
            // Carried-over issues (only when the toggle is on) stack on top.
            [['fixedLater', 'trend-bar-fixed-later'], ['pending', 'trend-bar-pending'], ['carried', 'trend-bar-carried']].forEach(([key, className]) => {
                const count = item[key] || 0;
                if (count === 0) return;
                const top = baseY - (above + count) * unit;
                const bottom = baseY - above * unit - (above > 0 ? segmentGap : baselineGap);
                rect(g, x, top, barW, bottom - top, className);
                above += count;
            });

            if (item.fixed > 0) {
                const top = baseY + baselineGap;
                rect(g, x, top, barW, baseY + item.fixed * unit - top, 'trend-bar-fixed');
            }

            const showDetail = () => {
                trendsTooltip.textContent = `Driver ${versionDisplay}${when}: ${detail}`;
            };
            g.addEventListener('mouseenter', showDetail);
            g.addEventListener('focus', showDetail);
            g.addEventListener('click', () => goToDriver(item.version));
            g.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goToDriver(item.version);
                }
            });
        });

        svgEl('line', { x1: 0, x2: width, y1: baseY, y2: baseY, class: 'trend-baseline' });

        trendsChartSvg.appendChild(frag);
        resetTrendsTooltip();

        // Open the timeline at its newest end.
        if (enteringTimeline) {
            const wrapper = trendsChartSvg.parentElement;
            wrapper.scrollLeft = wrapper.scrollWidth;
        }
    }

    function applyFiltersAndSort(shouldRender = true, replaceHistory = false) {
        filteredDrivers = filterAndSortDrivers(allDrivers, {
            query: searchQuery(),
            filter: currentFilter,
            sort: currentSort,
        });

        const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / ITEMS_PER_PAGE));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);

        if (shouldRender) {
            currentPage = 1;
            renderDrivers();
            renderPagination();
            updateURL(replaceHistory);
        }
    }

    function driverMetaHTML(driver) {
        const parts = (driver.channels || []).map(channel =>
            `<span class="driver-channel">${escapeHTML(CHANNEL_LABELS[channel] || channel)}</span>`);
        if (driver.release_date) {
            parts.push(`<time datetime="${escapeHTML(driver.release_date)}">${escapeHTML(driver.release_date)}</time>`);
        }
        if (driver.release_notes) {
            parts.push(`<a href="${escapeHTML(driver.release_notes)}" target="_blank" rel="noopener noreferrer">Release notes</a>`);
        }
        return parts.length ? `<div class="driver-meta">${parts.join('')}</div>` : '';
    }

    function bugItemHTML(bug, driver, query) {
        const status = bugStatus(bug, driver.version);
        const statusTitle = status === 'fixed' ? 'Fixed in this driver'
            : status === 'fixed-later' ? 'Known issue in this driver, fixed later' : 'Known issue in this driver, not fixed yet';
        const ids = bug.ids || [];
        const idQuery = query.replace(/^#/, '');
        const idsHTML = ids.length
            ? `<span class="bug-ids"><span class="sr-only">NVIDIA bug ID${ids.length === 1 ? '' : 's'}:</span>${ids.map(id => `<span class="bug-id">#${highlightText(id, idQuery)}</span>`).join('')}</span>`
            : '';
        return `
            <div class="bug-desc">${highlightText(bug.description, query)}</div>
            <div class="bug-footer">
                ${idsHTML}
                <span class="status-badge status-${status}" title="${statusTitle}">
                    ${highlightText(bug.fixed_in || 'Pending', query)}
                </span>
            </div>
        `;
    }

    function renderDrivers() {
        driverContainer.innerHTML = '';
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const driversToRender = filteredDrivers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

        resultsStatus.textContent = `${filteredDrivers.length} driver${filteredDrivers.length === 1 ? '' : 's'} found`;

        if (driversToRender.length === 0) {
            driverContainer.innerHTML = `
                <div class="no-results" role="status">
                    ${icon('search-outline')}
                    <p>No results found for your current filters.</p>
                    <button class="clear-search-btn" id="empty-clear-btn">Clear all filters</button>
                </div>
            `;
            document.getElementById('empty-clear-btn')?.addEventListener('click', clearAllFilters);
            return;
        }

        const fragment = document.createDocumentFragment();
        const query = searchQuery();

        driversToRender.forEach(driver => {
            const versionDisplay = formatVersion(driver.version);
            const card = document.createElement('div');
            card.className = 'driver-card';
            card.id = `driver-${driver.version}`;

            // The version is a plain in-page link; the hashchange listener
            // below scrolls to and highlights the card.
            const header = document.createElement('div');
            header.className = 'driver-header';
            header.innerHTML = `
                <a class="driver-version" href="#driver-${escapeHTML(driver.version)}">${highlightText(`Driver ${versionDisplay}`, query)}</a>
                ${driverMetaHTML(driver)}
                <button class="copy-link-btn" aria-label="Copy link to Driver ${versionDisplay}" title="Copy link to driver">
                    ${icon('link-outline')}
                </button>
            `;
            header.querySelector('.copy-link-btn').addEventListener('click', () => {
                const url = new URL(window.location.href);
                url.hash = `driver-${driver.version}`;
                copyText(url.toString())
                    .then(() => showToast(`Link to Driver ${versionDisplay} copied!`))
                    .catch(() => showToast('Failed to copy link.'));
            });
            card.appendChild(header);

            const bugList = document.createElement('ul');
            bugList.className = 'bug-list';

            const bugsToShow = visibleBugs(driver, currentFilter, query);
            bugsToShow.forEach(bug => {
                const li = document.createElement('li');
                li.className = 'bug-item';
                li.innerHTML = bugItemHTML(bug, driver, query);
                bugList.appendChild(li);
            });

            if (bugsToShow.length === 0) {
                const emptyLi = document.createElement('li');
                emptyLi.className = 'bug-item';
                emptyLi.innerHTML = '<div class="bug-desc bug-desc--empty">No bugs match the current filter.</div>';
                bugList.appendChild(emptyLi);
            }

            card.appendChild(bugList);
            fragment.appendChild(card);
        });
        driverContainer.appendChild(fragment);
    }

    function highlightDriverCard(el) {
        // Forcing a reflow restarts the animation if the card is already pulsing.
        el.classList.remove('highlight-pulse');
        void el.offsetWidth;
        el.classList.add('highlight-pulse');
        clearTimeout(el._highlightTimeout);
        el._highlightTimeout = setTimeout(() => el.classList.remove('highlight-pulse'), 2600);
    }

    function scrollToDriverFromHash() {
        const hash = window.location.hash;
        if (!hash.startsWith('#driver-')) return;
        setTimeout(() => {
            const el = document.getElementById(hash.slice(1));
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                highlightDriverCard(el);
            }
        }, 150);
    }

    function renderPagination() {
        paginationContainer.innerHTML = '';
        const totalPages = Math.ceil(filteredDrivers.length / ITEMS_PER_PAGE);
        if (totalPages <= 1) return;

        const createBtn = (content, page, label, active = false, disabled = false) => {
            const btn = document.createElement('button');
            btn.className = `page-btn ${active ? 'active' : ''}`;
            btn.innerHTML = content;
            btn.setAttribute('aria-label', label);
            if (active) btn.setAttribute('aria-current', 'page');
            btn.disabled = disabled;
            if (!disabled) btn.addEventListener('click', () => changePage(page));
            return btn;
        };

        paginationContainer.appendChild(createBtn(icon('chevron-back-outline'), currentPage - 1, 'Previous page', false, currentPage === 1));

        paginationPages(currentPage, totalPages).forEach(p => {
            if (p === '...') {
                const dots = document.createElement('span');
                dots.textContent = '...';
                dots.className = 'page-btn page-ellipsis';
                paginationContainer.appendChild(dots);
            } else {
                paginationContainer.appendChild(createBtn(p, p, `Go to page ${p}`, p === currentPage));
            }
        });

        paginationContainer.appendChild(createBtn(icon('chevron-forward-outline'), currentPage + 1, 'Next page', false, currentPage === totalPages));
    }

    function changePage(newPage) {
        currentPage = newPage;
        document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
        renderDrivers();
        renderPagination();
        updateURL();
    }

    function clearAllFilters() {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        currentFilter = 'all';
        currentSort = 'version-desc';
        sortSelect.value = currentSort;
        updateChipUI();
        applyFiltersAndSort();
    }

    searchInput.addEventListener('input', () => {
        searchClearBtn.classList.toggle('hidden', !searchInput.value);
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => applyFiltersAndSort(true, true), 300);
    });

    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.classList.add('hidden');
        applyFiltersAndSort();
        searchInput.focus();
    });

    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFiltersAndSort();
    });

    statusChips.forEach(chip => {
        chip.addEventListener('click', () => {
            currentFilter = chip.dataset.filter;
            updateChipUI();
            applyFiltersAndSort();
        });
    });

    trendsRangeChips.forEach(chip => {
        chip.addEventListener('click', () => {
            trendsRangeChips.forEach(c => {
                const isActive = c === chip;
                c.classList.toggle('active', isActive);
                c.setAttribute('aria-pressed', isActive);
            });
            renderTrendsChart(chip.dataset.range);
        });
    });

    carriedToggle?.addEventListener('change', () => {
        includeCarried = carriedToggle.checked;
        renderTrendsChart();
    });

    // The chart width depends on the container width, so it is rebuilt on resize.
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => renderTrendsChart(), 200);
    });

    trendsChartSvg?.addEventListener('mouseleave', resetTrendsTooltip);

    window.addEventListener('hashchange', scrollToDriverFromHash);

    window.addEventListener('popstate', () => {
        if (allDrivers.length === 0) return;
        clearTimeout(searchDebounceTimer);
        loadStateFromURL();
        applyFiltersAndSort(false);
        renderDrivers();
        renderPagination();
    });
});
