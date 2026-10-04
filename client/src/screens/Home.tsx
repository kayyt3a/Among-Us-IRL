import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, House, KeyRound, Sparkles, Users } from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Logo from '../components/ui/Logo';
import HowToPlay from '../components/HowToPlay';

function codeFromUrl(): string {
  const code = new URLSearchParams(window.location.search).get('code') ?? '';
  return /^[a-z0-9]{4}$/i.test(code) ? code.toUpperCase() : '';
}

export default function Home() {
  const game = useGame();
  const [initialCode] = useState(codeFromUrl);
  const [mode, setMode] = useState<'root' | 'create' | 'join'>(initialCode ? 'join' : 'root');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await game.createRoom(name.trim());
    setBusy(false);
  }

  async function handleJoin() {
    if (!name.trim() || code.trim().length < 4 || busy) return;
    setBusy(true);
    await game.joinRoom(code.trim(), name.trim());
    setBusy(false);
  }

  if (mode === 'root') {
    return (
      <div className="screen" style={{ justifyContent: 'center', gap: 28 }}>
        <div className="stack center" style={{ alignItems: 'center', gap: 18 }}>
          <Logo size={84} />
          <div className="stack-sm">
            <h1 className="display">IRL Impostor</h1>
            <p className="muted" style={{ fontSize: 16, maxWidth: 300, margin: '0 auto' }}>
              The social deduction party game you play in a real house, with real friends.
            </p>
          </div>
        </div>

        <div className="stack">
          <button className="btn btn-primary btn-lg btn-block" onClick={() => setMode('create')}>
            Host a game
            <ArrowRight size={18} />
          </button>
          <button className="btn btn-secondary btn-lg btn-block" onClick={() => setMode('join')}>
            Join a game
          </button>
        </div>

        <div className="steps">
          <div className="step">
            <div className="icon-circle red" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Sparkles size={17} />
            </div>
            <span className="tiny muted">One phone hosts a room</span>
          </div>
          <div className="step">
            <div className="icon-circle cyan" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Users size={17} />
            </div>
            <span className="tiny muted">Friends join with the code</span>
          </div>
          <div className="step">
            <div className="icon-circle amber" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <House size={17} />
            </div>
            <span className="tiny muted">Play around your house</span>
          </div>
        </div>

        <button className="btn btn-ghost btn-block" onClick={() => setShowGuide(true)}>
          <BookOpen size={17} />
          How to play
        </button>

        {showGuide && <HowToPlay onClose={() => setShowGuide(false)} />}
      </div>
    );
  }

  const isJoin = mode === 'join';
  const canSubmit = !!name.trim() && (!isJoin || code.trim().length === 4) && !busy;

  return (
    <div className="screen">
      <div className="row">
        <button className="icon-btn plain" aria-label="Back" onClick={() => setMode('root')}>
          <ChevronLeft size={22} />
        </button>
      </div>

      <div className="stack-lg" style={{ marginTop: 8 }}>
        <div className="stack-sm">
          <div className={`icon-circle ${isJoin ? 'cyan' : 'red'}`} style={{ marginBottom: 6 }}>
            {isJoin ? <KeyRound size={20} /> : <Sparkles size={20} />}
          </div>
          <h1 className="h1">{isJoin ? 'Join a game' : 'Host a game'}</h1>
          <p className="muted">
            {isJoin
              ? 'Enter the 4-letter code shown on the host’s screen.'
              : 'You’ll get a room code to share with everyone in the house.'}
          </p>
        </div>

        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (isJoin) handleJoin();
            else handleCreate();
          }}
        >
          {isJoin && (
            <div>
              <label className="field-label" htmlFor="room-code">
                Room code
              </label>
              <input
                id="room-code"
                className="field field-code"
                placeholder="ABCD"
                value={code}
                maxLength={4}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                autoFocus={!initialCode}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="player-name">
              Your name
            </label>
            <input
              id="player-name"
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={24}
              autoComplete="nickname"
              autoFocus={!isJoin || !!initialCode}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!canSubmit} style={{ marginTop: 6 }}>
            {busy ? (isJoin ? 'Joining…' : 'Creating…') : isJoin ? 'Join room' : 'Create room'}
          </button>
        </form>
      </div>
    </div>
  );
}
