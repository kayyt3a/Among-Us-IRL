// Sound + haptic cues for moments that matter physically. This is a game
// played away from the screen, so a meeting call or a death needs to reach
// someone whose phone is face-down on the couch, not just show up as text.

import { getAudioContextCtor } from './proximity';

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported browser, do nothing
  }
}

interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
}

function playSequence(notes: Note[]) {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  const ctx = new Ctor();
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const t0 = ctx.currentTime + n.at;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.linearRampToValueAtTime(0, t0 + n.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + n.dur + 0.05);
  }
  const totalMs = notes.reduce((max, n) => Math.max(max, (n.at + n.dur) * 1000), 0) + 200;
  setTimeout(() => ctx.close().catch(() => {}), totalMs);
}

/** Everyone gets this: get up, go to the meeting spot. */
export function alertMeetingCalled() {
  vibrate([200, 100, 200, 100, 200]);
  playSequence([
    { freq: 880, at: 0, dur: 0.15 },
    { freq: 660, at: 0.18, dur: 0.15 },
    { freq: 880, at: 0.36, dur: 0.15 },
    { freq: 660, at: 0.54, dur: 0.22 },
  ]);
}

export function alertYouDied() {
  vibrate(400);
  playSequence([
    { freq: 330, at: 0, dur: 0.3, type: 'sawtooth' },
    { freq: 220, at: 0.28, dur: 0.5, type: 'sawtooth' },
  ]);
}

export function alertSabotage() {
  vibrate([100, 60, 100, 60, 100]);
  playSequence([
    { freq: 500, at: 0, dur: 0.1 },
    { freq: 500, at: 0.15, dur: 0.1 },
    { freq: 500, at: 0.3, dur: 0.1 },
  ]);
}

export function alertVent() {
  vibrate(80);
}

export function alertGameOver(won: boolean) {
  if (won) {
    vibrate([150, 80, 150, 80, 300]);
    playSequence([
      { freq: 523, at: 0, dur: 0.15 },
      { freq: 659, at: 0.15, dur: 0.15 },
      { freq: 784, at: 0.3, dur: 0.35 },
    ]);
  } else {
    vibrate(500);
    playSequence([
      { freq: 392, at: 0, dur: 0.25, type: 'sawtooth' },
      { freq: 261, at: 0.25, dur: 0.5, type: 'sawtooth' },
    ]);
  }
}

/** A short, quiet buzz confirming a kill/shot landed. For the killer's own screen only. */
export function bumpKillConfirmed() {
  vibrate(60);
}

/** A quick, bright ding for when one of the two sabotage words gets solved. */
export function alertSabotageWordSolved() {
  vibrate(40);
  playSequence([{ freq: 900, at: 0, dur: 0.08 }]);
}

/** Relief cue for when both words are solved and the accelerated drain stops. */
export function alertSabotageStopped() {
  vibrate([80, 50, 80]);
  playSequence([
    { freq: 660, at: 0, dur: 0.1 },
    { freq: 880, at: 0.12, dur: 0.18 },
  ]);
}

export function alertClockLow() {
  vibrate([150, 80, 150]);
  playSequence([
    { freq: 700, at: 0, dur: 0.12 },
    { freq: 700, at: 0.2, dur: 0.12 },
  ]);
}
