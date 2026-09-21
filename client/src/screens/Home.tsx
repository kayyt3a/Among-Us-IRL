import { useState } from 'react';
import { useGame } from '../state/GameProvider';

export default function Home() {
  const game = useGame();
  const [mode, setMode] = useState<'root' | 'create' | 'join'>('root');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="app-shell">
      <div className="stack" style={{ flex: 1, justifyContent: 'center' }}>
        <div className="center stack" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 56 }}>🔪</div>
          <h1 className="title">IRL Impostor</h1>
          <p className="subtitle">A real-life social deduction party game.</p>
        </div>

        {mode === 'root' && (
          <div className="stack">
            <button className="btn btn-primary btn-block" onClick={() => setMode('create')}>
              Host a game
            </button>
            <button className="btn btn-block" onClick={() => setMode('join')}>
              Join a game
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="stack card">
            <h2>Host a game</h2>
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary btn-block" disabled={!name.trim() || busy} onClick={handleCreate}>
              {busy ? 'Creating…' : 'Create room'}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setMode('root')}>
              Back
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="stack card">
            <h2>Join a game</h2>
            <input
              className="field"
              placeholder="Your name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <input
              className="field"
              placeholder="Room code"
              value={code}
              maxLength={4}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
            />
            <button
              className="btn btn-primary btn-block"
              disabled={!name.trim() || code.trim().length < 4 || busy}
              onClick={handleJoin}
            >
              {busy ? 'Joining…' : 'Join room'}
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => setMode('root')}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
