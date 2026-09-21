// Audio proximity handshake: the killer's phone plays a short near-ultrasonic
// tone through its speaker, and the target's phone listens for it via the
// mic. If the target hears the exact tone the server assigned to this
// attempt, the two phones are close enough together that the sound carried
// — a physical proximity check that needs no pairing, Bluetooth, or GPS.
//
// This is inherently a bit fuzzy: cheap speakers/mics roll off near 18-19kHz,
// party noise raises the detection floor, and iOS audio processing varies by
// device. It's tuned to be reasonably reliable at "same room, few feet apart"
// range, not laboratory-precise — callers should always offer an honor-code
// fallback for when it fails.

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Plays a sine tone at frequencyHz for durationMs. Returns a function that stops it early. */
export function playProximityTone(frequencyHz: number, durationMs: number): () => void {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return () => {};

  const ctx = new Ctor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequencyHz;
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      // already stopped
    }
    setTimeout(() => ctx.close().catch(() => {}), 150);
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

/**
 * Opens the mic and watches for any of candidateFrequencies to rise well
 * above the ambient noise floor. Calls onDetected once with the matching
 * frequency, or never if the window elapses first. Always releases the mic
 * when it stops.
 */
export function scanForTone(
  candidateFrequencies: number[],
  windowMs: number,
  onDetected: (frequencyHz: number) => void
): Promise<ScanHandle> {
  const Ctor = getAudioContextCtor();
  if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
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
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const binHz = ctx.sampleRate / analyser.fftSize;
      let stopped = false;
      let raf = 0;

      const cleanup = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };

      const tick = () => {
        if (stopped) return;
        analyser.getByteFrequencyData(data);

        const sorted = Array.from(data).sort((a, b) => a - b);
        const noiseFloor = sorted[Math.floor(sorted.length / 2)];

        for (const freq of candidateFrequencies) {
          const bin = Math.round(freq / binHz);
          const magnitude = data[bin] ?? 0;
          if (magnitude > noiseFloor + 40 && magnitude > 90) {
            stopped = true;
            cleanup();
            onDetected(freq);
            return;
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
    });
}
