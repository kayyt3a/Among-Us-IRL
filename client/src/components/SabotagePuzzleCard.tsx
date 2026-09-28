import { useState } from 'react';
import { Check, Zap } from 'lucide-react';
import type { SabotagePuzzle } from '@irl-impostor/shared';
import { useGame } from '../state/GameProvider';

function Letters({ word, solved }: { word: string; solved?: boolean }) {
  return (
    <div className={`letter-tiles${solved ? ' solved' : ''}`} aria-label={word}>
      {word.split('').map((ch, i) => (
        <span key={i} className="letter-tile">
          {ch}
        </span>
      ))}
    </div>
  );
}

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
      <div className="row">
        <Letters word={scrambled} solved />
        <div className="spacer" />
        <span className="pill pill-green">
          <Check size={13} strokeWidth={3} />
          Solved
        </span>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <Letters word={scrambled} />
      <div className="row">
        <input
          className="field"
          placeholder="Unscramble it"
          aria-label={`Guess for word ${index + 1}`}
          value={guess}
          maxLength={20}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => {
            setGuess(e.target.value);
            setWrong(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn btn-primary" style={{ minHeight: 52 }} disabled={!guess.trim() || busy} onClick={submit}>
          Guess
        </button>
      </div>
      {wrong && <p className="error-text">Not quite. Try again.</p>}
    </div>
  );
}

export default function SabotagePuzzleCard({ puzzle }: { puzzle: SabotagePuzzle }) {
  return (
    <div className="card card-red sabotage stack" role="alert">
      <div className="row" style={{ gap: 12 }}>
        <div className="icon-circle red">
          <Zap size={20} />
        </div>
        <div className="stack-xs" style={{ flex: 1 }}>
          <h3 className="h2">Sabotage</h3>
          <p className="muted small">The clock drains 1.5x faster until both words are solved. Anyone can guess.</p>
        </div>
      </div>
      <WordRow index={0} scrambled={puzzle.scrambled[0]} solved={puzzle.solved[0]} />
      <div className="divider" />
      <WordRow index={1} scrambled={puzzle.scrambled[1]} solved={puzzle.solved[1]} />
    </div>
  );
}
