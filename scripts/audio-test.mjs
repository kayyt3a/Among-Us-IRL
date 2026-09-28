// Exercises the real client audio code (client/src/audio/proximity.ts) in a
// real Chromium, not a mock of the server state machine:
//
//   1. Loopback: the app's own tone generator is routed into its own mic
//      detector through a virtual cable, once per candidate frequency. Proves
//      the tone comes out at exactly the assigned frequency and that the
//      detector names that frequency, not a neighbour.
//   2. Microphone pipeline: Chromium's fake capture device is fed synthesized
//      WAV files, so detection runs through the real getUserMedia path.
//      Covers a clean tone, a tone under loud party-style noise, and a tone
//      that only starts after a run of claps; plus noise alone, claps alone,
//      and an out-of-band tone, none of which may trigger.
//   3. Unlock: audio suspended the way a phone suspends it comes back on the
//      next tap, and every sound shares that one context.
//
// Needs Playwright with a Chromium build. It uses a local install if there is
// one, otherwise the global one. No game server needed: an embedded Vite
// server serves the client source directly.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { PROXIMITY_FREQUENCIES_HZ } from '@irl-impostor/shared';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(join(globalRoot, 'noop.js'))('playwright');
  }
}

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log('  pass:', msg);
  } else {
    failures++;
    console.log('  FAIL:', msg);
  }
}

// Seeded so the "party noise" is identical run to run.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 16-bit mono PCM WAV. `tones` are pure sines that switch on abruptly at
 * `startAt` seconds; `hiss` is broadband white noise; `babble` is loud
 * low/mid-frequency noise plus wobbling voice-band harmonics, a rough
 * stand-in for a room full of people talking and music; `clicks` adds a sharp
 * full-scale snap every that-many seconds, like claps or a dropped plate.
 */
function writeWav(path, { tones = [], hiss = 0, babble = 0, clicks = 0, seconds = 6, sampleRate = 48000, seed = 1 }) {
  const rand = mulberry32(seed);
  const n = sampleRate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);

  const voices = [140, 220, 310, 480, 750, 1200, 2100, 3300].map((f) => ({ f, phase: rand() * 6.28 }));
  let lp = 0;
  const clickEvery = Math.round(clicks * sampleRate);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    let s = 0;
    for (const { freq, amp, startAt = 0 } of tones) if (t >= startAt) s += amp * Math.sin(2 * Math.PI * freq * t);
    s += hiss * (rand() * 2 - 1);
    if (clickEvery && i % clickEvery < 90) s += (rand() * 2 - 1) * Math.exp(-(i % clickEvery) / 25);
    if (babble) {
      lp += 0.08 * (rand() * 2 - 1 - lp);
      let v = 0;
      for (const { f, phase } of voices) {
        const wobble = 0.5 + 0.5 * Math.sin(2 * Math.PI * (0.7 + f / 900) * t + phase);
        v += wobble * Math.sin(2 * Math.PI * f * t * (1 + 0.01 * Math.sin(3 * t + phase)));
      }
      s += babble * (lp * 4 + v / voices.length);
    }
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

const HARNESS_PATH = '/__audio-harness';

async function openHarness(browser, baseUrl) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`**${HARNESS_PATH}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>audio harness</title><body></body>' })
  );
  await page.goto(baseUrl + HARNESS_PATH);
  await page.evaluate(async () => {
    window.__proximity = await import('/src/audio/proximity.ts');
  });
  return { page, errors };
}

/** Runs the real scanForTone against whatever the mic currently hears. Resolves with the detected Hz or null. */
function scan(page, candidates, windowMs) {
  return page.evaluate(
    ({ candidates, windowMs }) =>
      new Promise((resolve) => {
        let done = false;
        window.__proximity.scanForTone(candidates, windowMs, (hz) => {
          done = true;
          resolve(hz);
        });
        setTimeout(() => !done && resolve(null), windowMs + 300);
      }),
    { candidates, windowMs }
  );
}

async function main() {
  const { chromium } = await loadPlaywright();
  const vite = await createServer({
    root: join(repoRoot, 'client'),
    logLevel: 'silent',
    server: { port: 5188, strictPort: false },
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls.local[0].replace(/\/$/, '');
  const wavDir = mkdtempSync(join(tmpdir(), 'irl-audio-'));

  const baseArgs = ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

  try {
    console.log('=== 1. Loopback: the app\'s own tone into its own detector ===');
    {
      const browser = await chromium.launch({ args: [...baseArgs, '--autoplay-policy=no-user-gesture-required'] });
      for (const freq of PROXIMITY_FREQUENCIES_HZ) {
        const { page, errors } = await openHarness(browser, baseUrl);
        // Virtual cable: whatever the app sends to its speakers is also offered
        // to the app as its microphone.
        await page.evaluate(() => {
          const ctx = window.__proximity.getAudioContext();
          const cable = ctx.createMediaStreamDestination();
          const realConnect = AudioNode.prototype.connect;
          AudioNode.prototype.connect = function (dest, ...rest) {
            if (dest === ctx.destination) realConnect.call(this, cable);
            return realConnect.call(this, dest, ...rest);
          };
          navigator.mediaDevices.getUserMedia = async () => cable.stream;
        });
        const heard = await page.evaluate(
          ({ freq, candidates }) =>
            new Promise((resolve) => {
              const stopTone = window.__proximity.playProximityTone(freq, 3000);
              let done = false;
              window.__proximity.scanForTone(candidates, 3000, (hz) => {
                done = true;
                stopTone();
                resolve(hz);
              });
              setTimeout(() => !done && resolve(null), 3300);
            }),
          { freq, candidates: PROXIMITY_FREQUENCIES_HZ }
        );
        check(heard === freq, `tone at ${freq} Hz detected as ${heard ?? 'nothing'}`);
        check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
        await page.close();
      }
      await browser.close();
    }

    console.log('\n=== 2. Real microphone pipeline, fed recorded audio ===');
    const cases = [
      { name: 'clean tone at 17600 Hz', wav: { tones: [{ freq: 17600, amp: 0.5 }], hiss: 0.01 }, expect: 17600 },
      { name: 'clean tone at 18600 Hz', wav: { tones: [{ freq: 18600, amp: 0.5 }], hiss: 0.01 }, expect: 18600 },
      {
        name: 'faint 18000 Hz tone under loud party noise',
        wav: { tones: [{ freq: 18000, amp: 0.08 }], babble: 0.55, hiss: 0.01 },
        expect: 18000,
      },
      { name: 'party noise alone (must not trigger)', wav: { babble: 0.6, hiss: 0.02 }, expect: null },
      {
        name: 'out-of-band 19500 Hz tone (must not trigger)',
        wav: { tones: [{ freq: 19500, amp: 0.5 }], hiss: 0.01 },
        expect: null,
      },
      {
        name: 'sharp claps and clicks over chatter (must not trigger)',
        wav: { clicks: 0.2, babble: 0.3, hiss: 0.01 },
        expect: null,
      },
      {
        name: 'real 18200 Hz tone arriving mid-scan after a run of claps',
        wav: { tones: [{ freq: 18200, amp: 0.4, startAt: 1.2 }], clicks: 0.2, babble: 0.3, hiss: 0.01 },
        expect: 18200,
      },
    ];
    for (const [i, c] of cases.entries()) {
      const wavPath = join(wavDir, `case-${i}.wav`);
      writeWav(wavPath, { ...c.wav, seed: i + 7 });
      const browser = await chromium.launch({
        args: [...baseArgs, '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${wavPath}`],
      });
      const { page, errors } = await openHarness(browser, baseUrl);
      const heard = await scan(page, PROXIMITY_FREQUENCIES_HZ, 3000);
      check(heard === c.expect, `${c.name}: expected ${c.expect ?? 'nothing'}, heard ${heard ?? 'nothing'}`);
      check(errors.length === 0, `no page errors (${errors.join('; ') || 'none'})`);
      await browser.close();
    }

    console.log('\n=== 3. A tap brings suspended audio back ===');
    {
      // Chromium never enforces autoplay blocking under automation, so this
      // suspends audio the way iOS does (on first load, or after the phone is
      // locked) and checks that one tap anywhere resumes it.
      const browser = await chromium.launch({ args: baseArgs });
      const { page } = await openHarness(browser, baseUrl);
      const before = await page.evaluate(async () => {
        window.__proximity.installAudioUnlock();
        window.__ctx = window.__proximity.getAudioContext();
        await window.__ctx.suspend();
        await new Promise((r) => setTimeout(r, 300));
        return window.__ctx.state;
      });
      check(before === 'suspended', `audio suspended the way a phone suspends it (state: ${before})`);
      await page.mouse.click(10, 10);
      const after = await page.evaluate(async () => {
        for (let i = 0; i < 20 && window.__ctx.state !== 'running'; i++) await new Promise((r) => setTimeout(r, 50));
        return window.__ctx.state;
      });
      check(after === 'running', `one tap resumes it (state: ${after})`);
      const same = await page.evaluate(() => window.__proximity.getAudioContext() === window.__ctx);
      check(same, 'the tone, the mic scan, and the alert sounds all share that one context');
      await browser.close();
    }
  } finally {
    await vite.close();
    rmSync(wavDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    if (failures > 0) {
      console.error(`\nAUDIO TEST FAILED: ${failures} check(s) failed`);
      process.exit(1);
    }
    console.log('\nALL AUDIO TESTS PASSED');
    process.exit(0);
  })
  .catch((e) => {
    console.error('AUDIO TEST FAILED:', e);
    process.exit(1);
  });
