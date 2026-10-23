import { useState } from 'react';
import { Check, LockKeyhole, Zap } from 'lucide-react';
import { type NumbersPuzzle, type SabotagePuzzle, type WordsPuzzle } from '@irl-impostor/shared';
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

/** Number lock: everyone alive taps a different number; together they have to hit the target. */
function NumberLock({ puzzle }: { puzzle: NumbersPuzzle }) {
  const game = useGame();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEnter = !game.dead && !game.me?.isSpectator;

  const total = puzzle.entered.reduce((a, b) => a + b, 0);
  const counts = new Map<number, number>();
  for (const n of puzzle.entered) counts.set(n, (counts.get(n) ?? 0) + 1);
  const hasDupes = [...counts.values()].some((c) => c > 1);
  const everyoneIn = puzzle.entered.length >= puzzle.needed;
  const chips = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const mine = pending ?? puzzle.myNumber;

  let hint: string;
  if (hasDupes) hint = 'Two people picked the same number. Someone has to change theirs.';
  else if (!everyoneIn) hint = `Waiting on ${puzzle.needed - puzzle.entered.length} more ${puzzle.needed - puzzle.entered.length === 1 ? 'player' : 'players'}.`;
  else if (total > puzzle.target) hint = `Too high by ${total - puzzle.target}. Someone pick a smaller number.`;
  else hint = `Too low by ${puzzle.target - total}. Someone pick a bigger number.`;

  async function pick(value: number) {
    if (!canEnter || pending !== null) return;
    setPending(value);
    setError(null);
    const res = await game.submitSabotageNumber(value);
    if (!res.ok) setError(res.error ?? "That didn't go through. Try again.");
    setPending(null);
  }

  return (
    <div className="card card-red sabotage stack" role="alert">
      <div className="row" style={{ gap: 12 }}>
        <div className="icon-circle red">
          <LockKeyhole size={20} />
        </div>
        <div className="stack-xs" style={{ flex: 1 }}>
          <h3 className="h2">Sabotage: number lock</h3>
          <p className="muted small">
            Everyone alive picks a different number from 1 to {puzzle.maxNumber}. Together they must add up to the target.
            The clock drains 1.5x faster until you do.
          </p>
        </div>
      </div>

      <div className="lock-scoreboard">
        <div>
          <span className="label">Target</span>
          <span className="lock-target tabular">{puzzle.target}</span>
        </div>
        <div className="lock-progress">
          <span className="label">Total so far</span>
          <span className={`lock-total tabular${everyoneIn && !hasDupes && total === puzzle.target ? ' ok' : ''}`}>{total}</span>
          <span className="faint tiny tabular">
            {Math.min(puzzle.entered.length, puzzle.needed)} of {puzzle.needed} picked
          </span>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="lock-chips" aria-label="Numbers picked so far">
          {chips.map(([n, c]) => (
            <span key={n} className={`lock-chip${c > 1 ? ' dupe' : ''}`}>
              {n}
              {c > 1 && <small>x{c}</small>}
            </span>
          ))}
        </div>
      )}
      <p className={`small ${hasDupes ? 'error-text' : 'muted'}`} style={{ margin: 0 }}>
        {hint}
      </p>

      {canEnter ? (
        <div className="stack-sm">
          <span className="label">{mine ? `Your number: ${mine}. Tap another to change it.` : 'Pick your number'}</span>
          <div className="lock-pad" role="group" aria-label="Pick your number">
            {Array.from({ length: puzzle.maxNumber }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`lock-key${mine === n ? ' selected' : ''}`}
                aria-pressed={mine === n}
                disabled={pending !== null}
                onClick={() => pick(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Only living players pick a number. Help them out loud.
        </p>
      )}
    </div>
  );
}

function Scramble({ puzzle }: { puzzle: WordsPuzzle }) {
  return (
    <div className="card card-red sabotage stack" role="alert">
      <div className="row" style={{ gap: 12 }}>
        <div className="icon-circle red">
          <Zap size={20} />
        </div>
        <div className="stack-xs" style={{ flex: 1 }}>
          <h3 className="h2">Sabotage: scramble</h3>
          <p className="muted small">The clock drains 1.5x faster until both words are solved. Anyone can guess.</p>
        </div>
      </div>
      <WordRow index={0} scrambled={puzzle.scrambled[0]} solved={puzzle.solved[0]} />
      <div className="divider" />
      <WordRow index={1} scrambled={puzzle.scrambled[1]} solved={puzzle.solved[1]} />
    </div>
  );
}

export default function SabotagePuzzleCard({ puzzle }: { puzzle: SabotagePuzzle }) {
  return puzzle.kind === 'numbers' ? <NumberLock puzzle={puzzle} /> : <Scramble puzzle={puzzle} />;
}
