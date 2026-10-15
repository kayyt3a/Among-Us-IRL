import { METRICS, type DayStats, type Metric, statsStorage, statsTimeZone } from './stats';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n: number) => n.toLocaleString('en');

function total(days: DayStats[], pick: (d: DayStats) => number) {
  return days.reduce((sum, d) => sum + pick(d), 0);
}

function summaryCard(title: string, days: DayStats[]) {
  const visitors = total(days, (d) => d.visitors);
  const rows: [string, number][] = [
    ['Visitors', visitors],
    ['From Instagram', total(days, (d) => d.counts.instagram)],
    ['Rooms created', total(days, (d) => d.counts.rooms)],
    ['Games started', total(days, (d) => d.counts.games)],
    ['Games finished', total(days, (d) => d.counts.finished)],
  ];
  return `<section class="card"><h2>${esc(title)}</h2>${rows
    .map(([label, n]) => `<div class="stat"><span>${label}</span><b>${fmt(n)}</b></div>`)
    .join('')}</section>`;
}

/** The private stats dashboard, rendered on the server so it needs no extra client code. */
export function renderStatsPage(days: DayStats[]): string {
  const last7 = days.slice(0, 7);
  const metricKeys = Object.keys(METRICS) as Metric[];
  const visitors30 = total(days, (d) => d.visitors);
  const rooms30 = total(days, (d) => d.counts.rooms);
  const games30 = total(days, (d) => d.counts.games);
  const finished30 = total(days, (d) => d.counts.finished);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

  const funnel = [
    ['Visitors', visitors30, ''],
    ['Created a room', rooms30, pct(rooms30, visitors30)],
    ['Started a game', games30, pct(games30, rooms30)],
    ['Finished a game', finished30, pct(finished30, games30)],
  ] as const;
  const maxFunnel = Math.max(1, visitors30, rooms30, games30, finished30);

  const table = `<table><thead><tr><th>Day</th><th>Visitors</th>${metricKeys
    .map((m) => `<th>${METRICS[m]}</th>`)
    .join('')}</tr></thead><tbody>${days
    .map(
      (d) =>
        `<tr><td>${d.day}</td><td>${fmt(d.visitors)}</td>${metricKeys.map((m) => `<td>${fmt(d.counts[m])}</td>`).join('')}</tr>`
    )
    .join('')}</tbody></table>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>IRL Imposter stats</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 48px; background: #07080d; color: #f4f5f8; font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  main { max-width: 1000px; margin: 0 auto; display: grid; gap: 18px; }
  main > *, .grid > * { min-width: 0; }
  h1 { margin: 0; font-size: 26px; letter-spacing: -0.02em; }
  h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #8a90a6; }
  .muted { color: #8a90a6; font-size: 13px; margin: 4px 0 0; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .card { background: #10131c; border: 1px solid #222838; border-radius: 16px; padding: 16px; }
  .stat { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid #1a1f2c; }
  .stat:first-of-type { border-top: 0; }
  .stat b { font-variant-numeric: tabular-nums; }
  .bar { display: grid; grid-template-columns: minmax(0, 130px) 1fr auto 40px; gap: 10px; align-items: center; padding: 5px 0; }
  .track { height: 10px; border-radius: 99px; background: #1a1f2c; overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, #ff6275, #e2263f); border-radius: 99px; }
  .bar b, .bar span { font-variant-numeric: tabular-nums; text-align: right; }
  .bar span { color: #8a90a6; font-size: 13px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
  th, td { padding: 8px 10px; text-align: right; white-space: nowrap; border-top: 1px solid #1a1f2c; }
  th { color: #8a90a6; font-weight: 600; border-top: 0; }
  th:first-child, td:first-child { text-align: left; }
</style></head>
<body><main>
  <div><h1>IRL Imposter stats</h1>
  <p class="muted">Stored in ${esc(statsStorage())}. Days are in ${esc(statsTimeZone)}. Visitors are counted once per day, without storing IPs. Link previews and bots aren't counted.</p></div>
  <div class="grid">${summaryCard('Today', days.slice(0, 1))}${summaryCard('Last 7 days', last7)}${summaryCard('Last 30 days', days)}</div>
  <section class="card"><h2>Last 30 days: from visit to finished game</h2>${funnel
    .map(
      ([label, n, rate]) =>
        `<div class="bar"><div>${label}</div><div class="track"><div class="fill" style="width:${(n / maxFunnel) * 100}%"></div></div><b>${fmt(n)}</b><span>${rate}</span></div>`
    )
    .join('')}</section>
  <section class="card"><h2>Day by day</h2><div class="table-wrap">${table}</div></section>
</main></body></html>`;
}
