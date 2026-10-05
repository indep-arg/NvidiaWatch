// Bar chart: known issues above the baseline, fixes below. One Tab stop for
// the whole chart; arrow keys move between bars and Enter opens the driver.
import { esc } from './ui.js';

const lib = window.NvidiaWatch;
const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
}

// Smallest round step with gridlines at least 22px apart and no more than
// three of them on a side.
function niceStep(unit, max) {
    return [1, 2, 5, 10, 20, 50].find(s => s * unit >= 22 && s * 3 >= max) || 100;
}

export function describe(item, { carried = false, launches } = {}) {
    const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
    let text = `Driver ${item.version}${item.date ? ` (${item.date})` : ''}: ${plural(item.known, 'known issue')}`
        + ` (${item.fixedLater} fixed later, ${item.pending} still open), ${plural(item.fixed, 'fix', 'fixes')}`;
    if (carried) text += `, ${item.carried} carried over from earlier drivers`;
    if (launches && launches.length) text += `. Launch driver for ${launches.join(', ')}`;
    return text;
}

/**
 * Draws `series` (from lib.trendSeries or lib.timelineSeries) into `container`.
 * Options: timeline (place bars by date), events (launch bands, timeline only),
 * carried (stack carried-over issues), height, label, onSelect(version),
 * animate (bars grow in; off when redrawn after a resize).
 * The chart redraws itself when its container changes width.
 */
export function renderChart(container, series, options = {}) {
    draw(container, series, options);
    if (!('ResizeObserver' in window)) return;
    let width = container.clientWidth;
    let frame;
    const observer = new ResizeObserver(() => {
        if (!container.isConnected) { observer.disconnect(); return; }
        if (Math.abs(container.clientWidth - width) < 8) return;
        width = container.clientWidth;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => draw(container, series, { ...options, animate: false }));
    });
    observer.observe(container);
}

function draw(container, series, options) {
    const { timeline = false, events = [], carried = false, height = 260, label = 'Bugs per driver', onSelect, animate = true } = options;
    container.innerHTML = `<div class="chart"><svg class="chart-axis" aria-hidden="true"></svg><div class="chart-scroll"></div></div><p class="chart-readout" aria-live="polite"></p>`;
    const axis = container.querySelector('.chart-axis');
    const scroll = container.querySelector('.chart-scroll');
    const readout = container.querySelector('.chart-readout');
    if (!series.length) {
        readout.textContent = 'No drivers to show.';
        return;
    }

    const launches = lib.launchesByDriver(events);
    const available = Math.max(scroll.clientWidth, 240);
    const padTop = timeline ? 34 : 10;
    const padBottom = 30;
    const plotH = height - padTop - padBottom;
    const maxUp = Math.max(1, ...series.map(s => s.known + (carried ? s.carried || 0 : 0)));
    const maxDown = Math.max(1, ...series.map(s => s.fixed));
    const unit = plotH / (maxUp + maxDown);
    const baseY = padTop + maxUp * unit;

    let width;
    let barW;
    let xOf;
    if (timeline) {
        const first = series[0].date;
        const span = Math.max(lib.daysBetween(first, series[series.length - 1].date), 1);
        // 1.6px per day keeps drivers released four days apart from overlapping.
        const perDay = Math.max((available - 16) / span, 1.6);
        width = Math.max(available, span * perDay + 16);
        barW = Math.min(8, Math.max(3, 4 * perDay - 1.5));
        xOf = (item) => 8 + lib.daysBetween(first, item.date) * perDay - barW / 2;
    } else {
        // Room on the right so the newest version label isn't cut off.
        const step = Math.max((available - 28) / series.length, 10);
        width = step * series.length + 28;
        barW = Math.max(4, step - Math.min(6, step * 0.25));
        xOf = (_, i) => i * step + (step - barW) / 2;
    }

    // Axis, drawn apart so it stays visible while the bars scroll.
    axis.setAttribute('viewBox', `0 0 64 ${height}`);
    axis.setAttribute('height', height);
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': `${label}. Use the arrow keys to move between drivers and Enter to open one.` });
    if (animate) svg.classList.add('grow');
    const stepUp = niceStep(unit, maxUp);
    const stepDown = niceStep(unit, maxDown);
    for (let v = stepUp; v <= maxUp; v += stepUp) {
        const y = baseY - v * unit;
        el('line', { x1: 0, x2: width, y1: y, y2: y, class: 'grid' }, svg);
        el('text', { x: 58, y: y + 4, 'text-anchor': 'end' }, axis).textContent = `${v} known`;
    }
    for (let v = stepDown; v <= maxDown; v += stepDown) {
        const y = baseY + v * unit;
        el('line', { x1: 0, x2: width, y1: y, y2: y, class: 'grid' }, svg);
        el('text', { x: 58, y: y + 4, 'text-anchor': 'end' }, axis).textContent = `${v} fixed`;
    }

    if (timeline) {
        const first = series[0].date;
        const x = date => 8 + lib.daysBetween(first, date) * ((width - 16) / Math.max(lib.daysBetween(first, series[series.length - 1].date), 1));
        lib.launchBands(events).forEach(band => {
            const x0 = x(band.start) - 6;
            const x1 = x(band.end) + 6;
            el('rect', { x: x0, y: 0, width: x1 - x0, height: height - padBottom, class: 'band' }, svg);
            el('text', { x: x0 + 6, y: 14 }, svg).textContent = `${band.family} launches`;
        });
        const lastYear = Number(series[series.length - 1].date.slice(0, 4));
        for (let year = Number(first.slice(0, 4)) + 1; year <= lastYear; year++) {
            const yx = x(`${year}-01-01`);
            el('line', { x1: yx, x2: yx, y1: padTop, y2: height - padBottom + 6, class: 'year' }, svg);
            el('text', { x: yx + 4, y: height - 8 }, svg).textContent = year;
        }
    } else {
        // Version labels from the newest bar back, spaced so they never touch.
        const step = (width - 28) / series.length;
        const every = Math.ceil(52 / step);
        series.forEach((item, i) => {
            if ((series.length - 1 - i) % every !== 0) return;
            el('text', { x: xOf(item, i) + barW / 2, y: height - 8, 'text-anchor': 'middle' }, svg).textContent = item.version;
        });
    }

    const bars = series.map((item, i) => {
        const x = xOf(item, i);
        const text = describe(item, { carried, launches: launches.get(item.version) });
        // Bars grow in from left to right, the whole chart within half a second.
        const g = el('g', { class: 'bar', tabindex: '-1', role: 'link', 'aria-label': `${text}. Open driver.`, 'data-version': item.version, style: `--d: ${Math.round((i / series.length) * 350)}ms` }, svg);
        el('rect', { x: x - 2, y: padTop, width: barW + 4, height: plotH, class: 'hit' }, g);
        // The stacked pieces above the line grow together from the baseline.
        const up = el('g', { class: 'up' }, g);
        let above = 0;
        [['fixedLater', 'later'], ['pending', 'open'], ...(carried ? [['carried', 'carried']] : [])].forEach(([key, cls]) => {
            const n = item[key] || 0;
            if (!n) return;
            const top = baseY - (above + n) * unit;
            const bottom = baseY - above * unit - (above ? 1.5 : 1);
            el('rect', { x, y: top, width: barW, height: Math.max(1, bottom - top), class: cls }, up);
            above += n;
        });
        if (item.fixed) el('rect', { x, y: baseY + 1, width: barW, height: Math.max(1, item.fixed * unit - 1), class: 'fixed' }, el('g', { class: 'down' }, g));
        const show = () => {
            readout.textContent = text;
            readout.classList.remove('changed');
            readout.getBoundingClientRect(); // restart the fade
            readout.classList.add('changed');
        };
        g.addEventListener('mouseenter', show);
        g.addEventListener('focus', show);
        g.addEventListener('click', () => onSelect && onSelect(item.version));
        return g;
    });
    el('line', { x1: 0, x2: width, y1: baseY, y2: baseY, class: 'baseline' }, svg);

    // Roving focus: the newest bar is the chart's single Tab stop.
    let active = bars.length - 1;
    bars[active].setAttribute('tabindex', '0');
    const focusBar = i => {
        bars[active].setAttribute('tabindex', '-1');
        active = Math.max(0, Math.min(bars.length - 1, i));
        bars[active].setAttribute('tabindex', '0');
        bars[active].focus();
    };
    svg.addEventListener('keydown', e => {
        const moves = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: bars.length - 1 };
        if (e.key in moves) {
            e.preventDefault();
            focusBar(moves[e.key]);
        } else if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
            e.preventDefault();
            onSelect(series[active].version);
        }
    });

    scroll.appendChild(svg);
    scroll.scrollLeft = scroll.scrollWidth;
    readout.textContent = `${series.length} drivers. Hover, tap or focus a bar for details.`;
}

export function legendHTML({ carried = false, launches = false } = {}) {
    const items = [
        ['later', 'Known issue, fixed later'],
        ['open', 'Known issue, still open'],
        ...(carried ? [['carried', 'Carried over from an earlier driver']] : []),
        ['fixed', 'Fixed in that driver'],
        ...(launches ? [['band', 'GPU launch period']] : []),
    ];
    return `<ul class="legend">${items.map(([color, text]) => {
        const swatch = color === 'carried' ? '<span class="swatch swatch-carried"></span>'
            : color === 'band' ? '<span class="swatch swatch-band"></span>'
            : `<span class="swatch swatch-${color}"></span>`;
        return `<li>${swatch}${esc(text)}</li>`;
    }).join('')}</ul>`;
}
