// How the data is collected, what each state means and what it can't show.
import { mark } from '../ui.js';

export function render(main, { drivers }) {
    const bugs = drivers.reduce((n, d) => n + d.bugs.length, 0);
    main.innerHTML = `
        <div class="prose">
            <h1 class="page-title">Methodology</h1>
            <p>NvidiaWatch logs the bugs NVIDIA lists for each Game Ready and Studio driver: the fixes and the open issues in the release notes, and in the feedback thread NVIDIA posts on its forums for every driver. Each entry is added by hand from those sources.</p>

            <h2>What each state means</h2>
            <p>A bug is counted under every driver whose notes list it: the driver that listed it first, and each later driver that repeated it as still open. Its state is read from that driver's point of view.</p>
            <ul class="states">
                <li>${mark('fixed')}<span><b>Fixed in this driver.</b> The driver's own notes list it as fixed. Known issues of earlier drivers that it fixed show here too, with the driver that listed them.</span></li>
                <li>${mark('fixed-later')}<span><b>Known issue, fixed later.</b> Listed as an open issue, then fixed in a later driver or outside the driver (a game patch, a profile update).</span></li>
                <li>${mark('pending')}<span><b>Known issue, still open.</b> No fix logged yet.</span></li>
                <li>${mark('carried')}<span><b>Carried over.</b> Listed in an earlier driver and fixed after this one, so this driver had it too.</span></li>
            </ul>

            <h2>Repeated and carried over issues</h2>
            <p>NVIDIA usually repeats an open issue in every release until it's fixed. Each driver that repeats it shows it under its known issues, marked with the driver it was first listed in ("Listed since 610.47"), so it's counted in every driver NVIDIA says it affects.</p>
            <p>Sometimes the notes stop repeating a bug that was fixed later. When a bug is listed in one driver and fixed several versions later, every driver in between shipped with it, even if its notes don't say so. Those drivers show it as carried over.</p>
            <p>Only bugs with a known fix version are carried. A bug that is still open, or that was fixed outside the driver, has no end point, so drivers only show it when their notes repeat it.</p>
            <p>The charts leave carried over issues out by default, so each bar counts what that driver's notes say. Turn them on in Trends to see them stacked.</p>

            <h2>Limits</h2>
            <ul>
                <li>Only what NVIDIA acknowledges shows up. Bugs that users report but NVIDIA never lists aren't here.</li>
                <li>Some bugs drop off NVIDIA's lists without a fix being mentioned. They stay as still open.</li>
                <li>Hotfix drivers aren't tracked as separate entries.</li>
                <li>Drivers NVIDIA withdrew, like 595.59, aren't listed. Their fixes count for the driver that replaced them.</li>
            </ul>

            <h2>Data</h2>
            <p>All ${drivers.length} drivers and ${bugs} bugs are in one file, <a href="drivers.json">drivers.json</a>, licensed CC BY 4.0. GPU launch dates are in <a href="events.json">events.json</a>.</p>
            <p>Found a mistake or a missing issue? <a href="https://github.com/indep-arg/NvidiaWatch/issues/new/choose">Open an issue</a> or a pull request on GitHub, with a link to the NVIDIA source.</p>
            <p class="explain">Unofficial project, not affiliated with or endorsed by NVIDIA.</p>
        </div>`;
    return 'Methodology';
}
