// Full UI walkthrough in headless Chromium: five players plus a late
// spectator click through every screen and sheet of a real game, with
// checks along the way. Needs the server running with a built client
// (npm run build && npm run dev:server). Screenshots land in SHOTS
// (default: a temp folder), handy for eyeballing a redesign.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  }
}
const { chromium } = await loadPlaywright();
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// Any real image works as a "task photo"; the client downscales it to a JPEG.
const PHOTO = join(REPO, 'client/public/og-image.png');

const BASE = process.env.BASE ?? 'http://localhost:4000';
const OUT = (process.env.SHOTS ?? mkdtempSync(join(tmpdir(), 'irl-ui-'))).replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });
const VIEWPORT = { width: 390, height: 844 };
const SCALE = Number(process.env.SCALE ?? 1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const problems = [];
function check(cond, msg) {
  if (!cond) problems.push(msg);
  log(cond ? '  ok  ' : '  FAIL', msg);
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const pages = {};
const consoleErrors = [];
async function newPlayer(name) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  // Headless Chromium always refuses real wake locks, so stand in a fake
  // Wake Lock API that tracks how many locks are currently held.
  await page.addInitScript(() => {
    const fake = {
      active: 0,
      last: null,
      async request() {
        const lock = new EventTarget();
        let released = false;
        lock.release = async () => {
          if (released) return;
          released = true;
          fake.active--;
          lock.dispatchEvent(new Event('release'));
        };
        fake.active++;
        fake.last = lock;
        return lock;
      },
    };
    Object.defineProperty(navigator, 'wakeLock', { value: fake, configurable: true });
    window.__wl = fake;
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${name}] console: ${m.text()}`);
  });
  pages[name] = page;
  return page;
}
const shot = async (page, name, full = true) => {
  await wait(550); // let entrance animations finish so captures are not mid-fade
  return page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });
};

// ---------- Home ----------
const host = await newPlayer('Maya');
await host.goto(BASE);
await host.getByRole('button', { name: 'Host a game' }).waitFor();
await shot(host, '01-home', false);
await host.getByRole('button', { name: 'How to play' }).click();
await host.locator('.sheet .guide').waitFor();
await shot(host, '01b-how-to-play', false);
check((await host.locator('.guide-role').count()) === 4, 'How to play explains all four special roles');
await host.getByRole('button', { name: 'Got it' }).click();
check((await host.locator('.sheet').count()) === 0, 'How to play closes with Got it');
check((await host.evaluate(() => window.__wl.active)) === 0, 'no wake lock on the home screen');
await host.getByRole('button', { name: 'Host a game' }).click();
await host.fill('#player-name', 'Maya');
await shot(host, '02-host-form', false);
await host.getByRole('button', { name: 'Create room' }).click();
await host.locator('[data-code]').waitFor();
const code = await host.locator('[data-code]').getAttribute('data-code');
log('room code', code);
check(/^[A-Z0-9]{4}$/.test(code), 'room code shown as tiles with a readable code');

// ---------- Joiners (one via invite link) ----------
const names = ['Liam', 'Priya', 'Noah', 'Zoe'];
for (const [i, n] of names.entries()) {
  const p = await newPlayer(n);
  if (i === 0) {
    await p.goto(`${BASE}/?code=${code}`);
    await p.locator('#room-code').waitFor();
    const prefilled = await p.inputValue('#room-code');
    check(prefilled === code, 'invite link opens Join with the code already filled in');
    await p.fill('#player-name', n);
    await shot(p, '03-join-form-from-invite', false);
  } else {
    await p.goto(BASE);
    await p.getByRole('button', { name: 'Join a game' }).click();
    await p.fill('#room-code', code);
    await p.fill('#player-name', n);
  }
  await p.getByRole('button', { name: 'Join room' }).click();
  await p.locator('[data-code]').waitFor();
}
await wait(400);

// ---------- Lobby setup ----------
await host.fill('input[placeholder="e.g. Living room couch"]', 'Kitchen island');
await host.locator('input[placeholder="e.g. Living room couch"]').blur();
for (const label of ['Sheriff', 'Judge', 'Photo proof for every task']) {
  await host.getByRole('switch', { name: label }).click();
  await wait(120);
}
await host.getByRole('switch', { name: 'Latecomers play immediately' }).click();
await host.fill('input[placeholder="e.g. Do your best chicken impression"]', 'Do your best chicken impression');
await host.getByRole('button', { name: 'Add task' }).click();
await wait(400);
check((await host.getByRole('switch', { name: 'Sheriff' }).getAttribute('aria-checked')) === 'true', 'Sheriff toggle switched on');
check((await host.getByRole('switch', { name: 'Latecomers play immediately' }).getAttribute('aria-checked')) === 'false', 'Latecomers toggle switched off');
await host.getByRole('button', { name: 'More game clock' }).click();
await wait(250);
check((await host.locator('.stepper-value', { hasText: '25 min' }).count()) === 1, 'host can lengthen the game clock in 5 minute steps');
await host.getByRole('button', { name: 'Less game clock' }).click();
await wait(250);
check((await pages.Liam.getByText('Timers', { exact: true }).count()) === 1, 'guests see the round timers');
await shot(host, '04-lobby-host');
check((await host.evaluate(() => window.__wl.active)) === 1, 'exactly one screen wake lock held once in a room');
// The browser drops the lock when the app is backgrounded; coming back should re-take it.
await host.evaluate(async () => {
  await window.__wl.last.release();
  document.dispatchEvent(new Event('visibilitychange'));
});
await wait(100);
check((await host.evaluate(() => window.__wl.active)) === 1, 'wake lock re-acquired after the browser drops it');
await pages.Liam.getByRole('button', { name: 'How to play' }).click();
await pages.Liam.locator('.sheet .guide').waitFor();
await pages.Liam.keyboard.press('Escape');
check((await pages.Liam.locator('.sheet').count()) === 0, 'How to play opens from the lobby and closes with Escape');
await shot(pages.Liam, '05-lobby-guest');
const guestSeesSheriff = await pages.Liam.getByText('Sheriff', { exact: true }).count();
check(guestSeesSheriff > 0, 'guest sees the enabled special roles read-only');

// ---------- Start ----------
await host.getByRole('button', { name: 'Start game' }).click();
for (const p of Object.values(pages)) await p.locator('.role-card').waitFor({ timeout: 8000 });
await wait(600);

const roles = {};
for (const [n, p] of Object.entries(pages)) {
  const impostor = (await p.locator('.role-card.impostor').count()) > 0;
  const chip = (await p.locator('.role-chip').count()) ? await p.locator('.role-chip').innerText() : null;
  roles[n] = { impostor, special: chip };
}
log('roles', JSON.stringify(roles));
const impostorName = Object.keys(roles).find((n) => roles[n].impostor);
const sheriffName = Object.keys(roles).find((n) => roles[n].special === 'Sheriff');
const judgeName = Object.keys(roles).find((n) => roles[n].special === 'Judge');
check(Object.values(roles).filter((r) => r.impostor).length === 1, 'exactly one impostor');
check(!!sheriffName && !!judgeName, 'Sheriff and Judge both dealt');
const imp = pages[impostorName];
const crewNames = Object.keys(roles).filter((n) => !roles[n].impostor);
const plainCrew = crewNames.find((n) => n !== sheriffName && n !== judgeName) ?? crewNames[0];

await shot(pages[sheriffName], '06-game-crew-sheriff');
await shot(imp, '07-game-impostor');
check((await imp.getByRole('button', { name: /Turn soundtrack (on|off)/ }).count()) === 1, 'soundtrack toggle is in the game header');
{
  const crewPage = pages[crewNames[0]];
  await crewPage.getByRole('button', { name: 'Report body' }).click();
  await crewPage.locator('.sheet').waitFor();
  await shot(crewPage, '07b-report-body-sheet', false);
  check((await crewPage.locator('.sheet .choice').count()) === 4, 'report sheet lists everyone else in the round');
  await crewPage.getByRole('button', { name: 'Cancel' }).click();
}
const readyCount = await imp.locator('.ability:not(:disabled)').count();
check(readyCount === 3, `all three impostor tools ready at round start (got ${readyCount})`);

// ---------- Hide / reveal role ----------
await imp.getByRole('button', { name: 'Hide role' }).click();
await imp.locator('.role-hidden').waitFor();
await shot(imp, '08-role-hidden', false);
check((await imp.locator('.role-card').count()) === 0, 'hiding the role removes the role card');
await imp.getByRole('button', { name: 'Show your role' }).click();
await imp.locator('.role-card').waitFor();

// ---------- Photo proof task ----------
const pc = pages[plainCrew];
const [chooser] = await Promise.all([pc.waitForEvent('filechooser'), pc.locator('.task:not(.done)').first().click()]);
await chooser.setFiles(PHOTO);
await pc.locator('.task.done').first().waitFor({ timeout: 8000 });
check((await pc.locator('.task.done').count()) === 1, 'photo upload marks the task done');
for (let i = 0; i < 2; i++) {
  const [c] = await Promise.all([pc.waitForEvent('filechooser'), pc.locator('.task:not(.done)').first().click()]);
  await c.setFiles(PHOTO);
  await pc.waitForFunction((n) => document.querySelectorAll('.task.done').length === n, i + 2);
}
await shot(pc, '09-game-tasks-photo-proof');

// ---------- Sheriff misfire ----------
const sh = pages[sheriffName];
await sh.getByRole('button', { name: 'Shoot a suspect' }).click();
await sh.locator('.sheet').waitFor();
await shot(sh, '10-sheet-sheriff', false);
const innocent = crewNames.find((n) => n !== sheriffName);
await sh.locator('.sheet .choice', { hasText: innocent }).click();
await wait(700);

// ---------- Impostor: vent, then eliminate sheet shows dead Sheriff ----------
await imp.getByRole('button', { name: /Vent/ }).click();
await wait(4500); // blackout lasts 4s on every screen
check(!(await imp.locator('.ability', { hasText: 'Vent' }).isEnabled()), 'vent goes on cooldown after use');
check(await imp.locator('.ability', { hasText: 'Eliminate' }).isEnabled(), 'eliminate stays ready after venting');
await imp.getByRole('button', { name: /Eliminate/ }).click();
await imp.locator('.sheet').waitFor();
await wait(400);
await shot(imp, '11-sheet-eliminate-dead-greyed', false);
const deadRow = imp.locator('.sheet .choice', { hasText: sheriffName });
check(await deadRow.isDisabled(), 'dead Sheriff is greyed out and unpickable in the impostor eliminate sheet');
const victim = crewNames.find((n) => n !== sheriffName && n !== judgeName && n !== plainCrew) ?? plainCrew;
await imp.locator('.sheet .choice', { hasText: victim }).click();
await wait(1500);
await shot(imp, '12-game-impostor-cooldowns');

// ---------- Sabotage + toast ----------
await imp.getByRole('button', { name: /Sabotage/ }).click();
await pages[judgeName].locator('.sabotage').waitFor();
await wait(250);
await shot(pages[judgeName], '13-game-sabotage-toast', false);
check((await pages[judgeName].locator('.toast-warning').count()) === 1, 'sabotage shows a warning-styled toast');

// ---------- Spectator (latecomer while latecomers are off) ----------
const late = await newPlayer('Ava');
await late.goto(BASE);
await late.getByRole('button', { name: 'Join a game' }).click();
await late.fill('#room-code', code);
await late.fill('#player-name', 'Ava');
await late.getByRole('button', { name: 'Join room' }).click();
await late.getByText("You're watching this round").waitFor();
await shot(late, '14-spectator');

// ---------- Meeting ----------
const jd = pages[judgeName];
await jd.getByRole('button', { name: 'Call meeting' }).click();
await jd.getByText('Emergency meeting').waitFor();
await wait(500);
await shot(jd, '15-meeting-discussion');
check((await jd.locator('.list .pill', { hasText: 'Dead' }).count()) === 2, 'discussion roster shows both dead players');
check((await jd.locator('.list .pill', { hasText: 'Watching' }).count()) === 1, 'discussion roster marks the spectator as watching');
check((await jd.getByText('4 alive').count()) === 0 && (await jd.getByText('3 alive').count()) === 1, 'alive count excludes the spectator');await jd.getByText('votes in').waitFor({ timeout: 75000 });
await wait(300);
for (const n of crewNames) {
  if (n === sheriffName || n === victim || n === judgeName) continue;
  if (n === crewNames.find((c) => c !== sheriffName && c !== victim && c !== judgeName)) {
    check((await pages[n].locator('.choice', { hasText: 'Ava' }).count()) === 0, 'spectator is not a vote option');
  }
  await pages[n].locator('.choice', { hasText: impostorName }).click();
}
await wait(500);
await shot(jd, '16-meeting-voting-judge');
check((await jd.locator('.toast').count()) === 0, 'sabotage toast auto-dismissed even while room state kept changing');
check(await jd.locator('.choice', { hasText: sheriffName }).isDisabled(), 'dead players greyed out in the vote list');
await jd.locator('.choice', { hasText: impostorName }).click();
await jd.getByText('was voted out').waitFor({ timeout: 40000 });
await wait(400);
await wait(2200); // let the ejection animation play out
await shot(jd, '17-meeting-result', false);
check((await jd.locator('.vote-breakdown .vote-row').count()) >= 1, 'meeting result shows who voted for whom');

// ---------- Game over ----------
await host.getByText(/win$/).first().waitFor({ timeout: 15000 });
await host.getByRole('button', { name: 'Continue' }).click().catch(() => {});
await wait(1200);
await shot(host, '18-game-over');
check((await host.getByText('Every impostor was caught.').count()) === 1, 'recap states the real reason the game ended');
check((await host.locator('.gallery-item').count()) === 3, 'recap gallery holds the 3 submitted photos');
check((await host.getByText('Ava', { exact: true }).count()) === 0, 'spectator is left out of the final roles list');
await host.locator('.gallery-item').first().click();
await host.locator('.lightbox').waitFor();
await shot(host, '19-lightbox', false);
await host.keyboard.press('Escape');
await host.locator('.lightbox').waitFor({ state: 'detached' }).catch(() => {});
await host.getByRole('button', { name: 'Leave' }).last().click();
await host.getByRole('button', { name: 'Host a game' }).waitFor();
check((await host.evaluate(() => window.__wl.active)) === 0, 'wake lock released after leaving the room');

writeFileSync(`${OUT}errors.json`, JSON.stringify(consoleErrors, null, 2));
log(`\nscreenshots: ${OUT}`);
log('\nconsole/page errors:', consoleErrors.length ? consoleErrors : 'none');
log(problems.length ? `\n${problems.length} FAILED CHECK(S)` : '\nALL UI CHECKS PASSED');
await browser.close();
process.exit(problems.length || consoleErrors.length ? 1 : 0);
