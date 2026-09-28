// Audio proximity handshake: the killer's phone plays a short near-ultrasonic
// tone through its speaker, and the target's phone listens for it via the
// mic. If the target hears the exact tone the server assigned to this
// attempt, the two phones are close enough together that the sound carried.
// A physical proximity check that needs no pairing, Bluetooth, or GPS.
//
// This is inherently a bit fuzzy: cheap speakers/mics roll off near 18-19kHz,
// party noise raises the detection floor, and iOS audio processing varies by
// device. It's tuned to be reasonably reliable at "same room, few feet apart"
// range, not laboratory-precise, so callers should always offer an honor-code
// fallback for when it fails.

type AudioContextCtor = typeof AudioContext;

export function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// One context for the whole app. Mobile browsers (iOS Safari especially) keep
// an AudioContext suspended, silent and deaf, unless it's started from a tap,
// and every sound here fires from a socket event instead. A single context
// unlocked on the first tap is what lets the kill tone, the mic scan, and the
// alert sounds actually run on a phone.
let sharedCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (!sharedCtx) {
    const Ctor = getAudioContextCtor();
    if (!Ctor) return null;
    sharedCtx = new Ctor();
  }
  if (sharedCtx.state !== 'running' && sharedCtx.state !== 'closed') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

function unlockFromGesture() {
  if (sharedCtx?.state === 'running') return;
  const ctx = getAudioContext();
  if (!ctx) return;
  // iOS only treats the context as unlocked once something starts inside the gesture.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

/**
 * Listens for taps for the life of the page: the first one unlocks audio,
 * and any later one re-resumes it if the OS suspended it (e.g. after the
 * phone was locked). A no-op while audio is already running.
 */
export function installAudioUnlock() {
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(type, unlockFromGesture, { capture: true, passive: true });
  }
}

/** Plays a sine tone at frequencyHz for durationMs. Returns a function that stops it early. */
export function playProximityTone(frequencyHz: number, durationMs: number): () => void {
  const ctx = getAudioContext();
  if (!ctx) return () => {};

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequencyHz;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.onended = () => gain.disconnect();
  osc.start();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.stop(now + 0.08);
    } catch {
      // already stopped
    }
  };

  const timer = setTimeout(stop, durationMs);
  return () => {
    clearTimeout(timer);
    stop();
  };
}

/** Requests mic access just to check availability, then immediately releases it. */
export async function requestMicPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export interface ScanHandle {
  stop: () => void;
}

// A real tone is a narrow peak that holds steady. A clap, a dropped plate, or
// the mic opening sprays energy across every frequency for a frame or two, so
// a candidate only counts once it stands clear of the bins either side of it
// (about 65Hz away, outside the tone's own spread) and stays that way for
// several frames running.
const SIDE_BIN_OFFSET = 6;
const SUSTAIN_FRAMES = 4;

/**
 * Opens the mic and listens for any of candidateFrequencies for windowMs.
 * Calls onDetected once for each candidate it hears. It keeps listening
 * after a detection, so a stray match can never cut the scan short before
 * the real tone arrives. Always releases the mic when it stops.
 */
export function scanForTone(
  candidateFrequencies: number[],
  windowMs: number,
  onDetected: (frequencyHz: number) => void
): Promise<ScanHandle> {
  const ctx = getAudioContext();
  if (!ctx || !navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve({ stop: () => {} });
  }

  return navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    .then((stream) => {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const binHz = ctx.sampleRate / analyser.fftSize;
      const streaks = new Map<number, number>();
      const reported = new Set<number>();
      let stopped = false;
      let raf = 0;

      const cleanup = () => {
        cancelAnimationFrame(raf);
        source.disconnect();
        stream.getTracks().forEach((t) => t.stop());
      };

      const tick = () => {
        if (stopped) return;
        analyser.getByteFrequencyData(data);

        const sorted = Array.from(data).sort((a, b) => a - b);
        const noiseFloor = sorted[Math.floor(sorted.length / 2)];

        for (const freq of candidateFrequencies) {
          const bin = Math.round(freq / binHz);
          const magnitude = data[bin] ?? 0;
          const sides = Math.max(data[bin - SIDE_BIN_OFFSET] ?? 0, data[bin + SIDE_BIN_OFFSET] ?? 0);
          const peaked = magnitude > 90 && magnitude > noiseFloor + 40 && magnitude > sides + 30;
          const run = peaked ? (streaks.get(freq) ?? 0) + 1 : 0;
          streaks.set(freq, run);
          if (run >= SUSTAIN_FRAMES && !reported.has(freq)) {
            reported.add(freq);
            onDetected(freq);
          }
        }
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
      const timeout = setTimeout(() => {
        if (!stopped) {
          stopped = true;
          cleanup();
        }
      }, windowMs);

      return {
        stop: () => {
          clearTimeout(timeout);
          if (!stopped) {
            stopped = true;
            cleanup();
          }
        },
      };
    })
    .catch(() => ({ stop: () => {} }));
}
