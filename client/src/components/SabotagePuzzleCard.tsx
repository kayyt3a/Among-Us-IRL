import { useState } from 'react';
import type { SabotagePuzzle } from '@irl-impostor/shared';
import { useGame } from '../state/GameProvider';

function WordRow({ index, scrambled, solved }: { index: 0 | 1; scrambled: string; solved: boolean }) {
  const game = useGame();
  const [guess, setGuess] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!guess.trim() || busy) return;
    setBusy(true);
    const ok = await game.submitUnscrambleGuess(index, guess);
    setBusy(false);
    if (ok) {
      setGuess('');
      setWrong(false);
    } else {
      setWrong(true);
    }
  }

  if (solved) {
    return (
      <div className="row" style={{ opacity: 0.55 }}>
        <span className="task-check checked" style={{ width: 24, height: 24 }}>
          ✓
        </span>
        <span style={{ fontWeight: 700, letterSpacing: '0.1em', textDecoration: 'line-through' }}>
          {scrambled}
        </span>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.15em' }}>{scrambled}</span>
      <div className="row">
        <input
          className="field"
          placeholder="Your guess"
          value={guess}
          maxLength={20}
          autoCapitalize="characters"
          onChange={(e) => {
            setGuess(e.target.value);
            setWrong(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn btn-sm btn-primary" disabled={!guess.trim() || busy} onClick={submit}>
          Guess
        </button>
      </div>
      {wrong && (
        <p className="error-text" style={{ margin: 0 }}>
          Not quite, try again.
        </p>
      )}
    </div>
  );
}

export default function SabotagePuzzleCard({ puzzle }: { puzzle: SabotagePuzzle }) {
  return (
    <div className="card stack" style={{ borderColor: 'var(--bad)' }}>
      <h3 style={{ margin: 0 }}>⚠ Sabotage: unscramble both words!</h3>
      <p className="subtitle" style={{ margin: 0 }}>
        The clock is draining fast while this is up. Anyone can guess, and solving both stops it.
      </p>
      <WordRow index={0} scrambled={puzzle.scrambled[0]} solved={puzzle.solved[0]} />
      <WordRow index={1} scrambled={puzzle.scrambled[1]} solved={puzzle.solved[1]} />
    </div>
  );
}
