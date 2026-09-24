// The sabotage minigame: two scrambled house-themed words the whole room can
// see and race to unscramble. Kept simple and single-case so it reads fine
// on a phone screen from across the room.

export const SABOTAGE_WORDS: string[] = [
  'KITCHEN',
  'PILLOW',
  'REMOTE',
  'BLANKET',
  'MIRROR',
  'CANDLE',
  'LADDER',
  'CLOSET',
  'HALLWAY',
  'CURTAIN',
  'FAUCET',
  'DOORBELL',
  'STAIRS',
  'GARAGE',
  'CHIMNEY',
  'BASKET',
  'CUSHION',
  'CARPET',
  'LANTERN',
  'SHELF',
  'DRAWER',
  'PORCH',
  'ATTIC',
  'FIREPLACE',
  'SLIPPERS',
  'TOASTER',
  'BLENDER',
  'HAMMER',
  'WRENCH',
  'BUCKET',
];

/** Shuffles a word's letters, guaranteed to differ from the original when possible. */
export function scrambleWord(word: string): string {
  if (word.length <= 1) return word;
  const letters = word.split('');
  let attempt = word;
  let guard = 0;
  while (attempt.toUpperCase() === word.toUpperCase() && guard < 10) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    attempt = letters.join('');
    guard++;
  }
  return attempt;
}

/** Picks two distinct random words from the pool for one sabotage round. */
export function pickTwoSabotageWords(): [string, string] {
  const pool = [...SABOTAGE_WORDS];
  const i = Math.floor(Math.random() * pool.length);
  const [w1] = pool.splice(i, 1);
  const j = Math.floor(Math.random() * pool.length);
  const [w2] = pool.splice(j, 1);
  return [w1, w2];
}
