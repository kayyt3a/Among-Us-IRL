// A quiet tension soundtrack while a round is being played: a low drone with
// a slow heartbeat that speeds up when the clock is nearly out or a sabotage
// is running. Everything is synthesized (no audio files to download) and sits
// far below the near-ultrasonic kill-check tones, so it can't interfere with them.

import { useEffect, useState } from 'react';
import { getAudioContext } from './proximity';

const MUTE_KEY = 'irl-imposter-ambience-muted';
const VOLUME = 0.07;

type Intensity = 'calm' | 'tense';

let nodes: { master: GainNode; stop: () => void } | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let intensity: Intensity = 'calm';

function thump(ctx: AudioContext, master: GainNode, at: number, strength: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(70, at);
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.18);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(strength, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  osc.connect(gain).connect(master);
  osc.onended = () => gain.disconnect();
  osc.start(at);
  osc.stop(at + 0.25);
}

function scheduleHeartbeat() {
  const ctx = getAudioContext();
  if (!ctx || !nodes) return;
  const now = ctx.currentTime + 0.05;
  const loud = intensity === 'tense' ? 1.6 : 1;
  thump(ctx, nodes.master, now, 0.9 * loud);
  thump(ctx, nodes.master, now + 0.24, 0.6 * loud);
  heartbeatTimer = setTimeout(scheduleHeartbeat, intensity === 'tense' ? 650 : 1400);
}

function start() {
  const ctx = getAudioContext();
  if (!ctx || nodes) return;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2.5);
  master.connect(ctx.destination);

  // The drone: two low, slightly detuned tones through a soft low-pass, with a
  // slow swell so it breathes instead of humming.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 260;
  const swell = ctx.createGain();
  swell.gain.value = 0.55;
  const lfo = ctx.createOscillator();
  const lfoDepth = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoDepth.gain.value = 0.25;
  lfo.connect(lfoDepth).connect(swell.gain);
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sine';
  a.frequency.value = 55;
  b.type = 'triangle';
  b.frequency.value = 82.6;
  a.connect(filter);
  b.connect(filter);
  filter.connect(swell).connect(master);
  [a, b, lfo].forEach((o) => o.start());

  nodes = {
    master,
    stop: () => {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.8);
      [a, b, lfo].forEach((o) => o.stop(t + 0.9));
      setTimeout(() => master.disconnect(), 1000);
    },
  };
  scheduleHeartbeat();
}

function stop() {
  if (heartbeatTimer) clearTimeout(heartbeatTimer);
  heartbeatTimer = null;
  nodes?.stop();
  nodes = null;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The player's soundtrack on/off preference, remembered on this device. */
export function useAmbienceMuted(): [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(readMuted);
  const update = (next: boolean) => {
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // private browsing, just don't remember it
    }
    window.dispatchEvent(new Event('ambience-muted'));
  };
  useEffect(() => {
    const sync = () => setMuted(readMuted());
    window.addEventListener('ambience-muted', sync);
    return () => window.removeEventListener('ambience-muted', sync);
  }, []);
  return [muted, update];
}

/** Plays the soundtrack while `active`, switching to the faster heartbeat when `tense`. */
export function useAmbience(active: boolean, tense: boolean) {
  useEffect(() => {
    intensity = tense ? 'tense' : 'calm';
  }, [tense]);
  useEffect(() => {
    if (!active) return;
    start();
    return stop;
  }, [active]);
}

/** A falling whoosh for someone being voted out. */
export function playEjectWhoosh() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const length = Math.floor(ctx.sampleRate * 1.6);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 3;
  const t = ctx.currentTime;
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(160, t + 1.5);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.55);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.onended = () => gain.disconnect();
  noise.start(t);
}
