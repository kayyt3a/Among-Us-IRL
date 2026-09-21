/**
 * Near-ultrasonic tones used for the audio proximity handshake. Spaced far
 * enough apart to resolve cleanly via FFT on a typical phone mic, and high
 * enough to be faint/mostly inaudible without relying on true ultrasonic
 * (>20kHz), which cheap phone speakers/mics reproduce poorly.
 */
export const PROXIMITY_FREQUENCIES_HZ = [17600, 17800, 18000, 18200, 18400, 18600];

/** How long the killer plays the tone / the target listens for it. */
export const PROXIMITY_WINDOW_MS = 8_000;
