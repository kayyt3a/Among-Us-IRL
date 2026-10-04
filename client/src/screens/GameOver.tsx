import { useEffect, useMemo, useState } from 'react';
import type { GameOverReason, TaskPhoto } from '@irl-impostor/shared';
import { Camera, LogOut, RotateCcw, Skull, Trophy, X } from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Avatar from '../components/ui/Avatar';

const REASONS: Record<GameOverReason, string> = {
  'impostors-caught': 'Every impostor was caught.',
  'tasks-complete': 'The crew finished every task.',
  'impostors-outnumber': 'The impostors took over the house.',
  'time-up': 'The clock ran out before the crew could finish.',
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function GameOver() {
  const game = useGame();
  const info = game.gameOver!;
  const crewWon = info.winner === 'crewmates';
  const photoProofEnabled = game.room?.settings.photoProofEnabled ?? false;
  const [photos, setPhotos] = useState<TaskPhoto[] | null>(null);
  const [viewing, setViewing] = useState<TaskPhoto | null>(null);

  const myId = game.session?.playerId;
  const myRole = info.players.find((p) => p.id === myId)?.role;
  const iWon = myRole ? (myRole === 'impostor') === !crewWon : null;

  useEffect(() => {
    if (!photoProofEnabled) return;
    let cancelled = false;
    game.fetchTaskPhotos().then((res) => {
      if (!cancelled) setPhotos(res);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoProofEnabled]);

  const photosByPlayer = useMemo(() => {
    if (!photos) return [];
    const map = new Map<string, { playerName: string; photos: TaskPhoto[] }>();
    for (const p of photos) {
      const entry = map.get(p.playerId) ?? { playerName: p.playerName, photos: [] };
      entry.photos.push(p);
      map.set(p.playerId, entry);
    }
    return Array.from(map.values());
  }, [photos]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewing]);

  return (
    <>
      <div className="screen has-footer">
        <header className="stack center" style={{ alignItems: 'center', gap: 18, paddingTop: 24 }}>
          <div className={`icon-circle xl ${crewWon ? 'cyan' : 'red'}`}>
            {crewWon ? <Trophy size={40} /> : <Skull size={40} />}
          </div>
          <div className="stack-sm" style={{ alignItems: 'center' }}>
            {iWon !== null && (
              <span className={`pill pill-lg ${iWon ? 'pill-green' : ''}`}>{iWon ? 'You won' : 'You lost'}</span>
            )}
            <h1 className="display">{crewWon ? 'Crewmates win' : 'Impostors win'}</h1>
            <p className="muted">{REASONS[info.reason]}</p>
          </div>
        </header>

        <div className="grid-2">
          <div className="stat">
            <span className="label">Tasks done</span>
            <div className="stat-value tabular">
              {info.tasksCompleted}
              <span className="faint" style={{ fontSize: 16, fontWeight: 600 }}>
                /{info.tasksTotal}
              </span>
            </div>
          </div>
          <div className="stat">
            <span className="label">Match length</span>
            <div className="stat-value tabular">{formatDuration(info.durationMs)}</div>
          </div>
        </div>

        <section className="stack-sm">
          <div className="section-header">
            <span className="label">Final roles</span>
          </div>
          <div className="list">
            {info.players.map((p) => {
              const wins = game.room?.players.find((rp) => rp.id === p.id)?.wins ?? 0;
              const dead = p.status === 'dead';
              const impostor = p.role === 'impostor';
              return (
                <div className="list-row" key={p.id}>
                  <Avatar name={p.name} dead={dead} />
                  <div className="list-row-main">
                    <span className="list-row-title truncate">
                      {p.name}
                      {p.id === myId && <span className="faint"> (you)</span>}
                    </span>
                    <span className="list-row-sub row-sm">
                      {dead ? (
                        <>
                          <Skull size={12} />
                          Died
                        </>
                      ) : (
                        'Survived'
                      )}
                      {wins > 0 && (
                        <>
                          <span className="faint">{'·'}</span>
                          <Trophy size={12} />
                          {wins} win{wins > 1 ? 's' : ''}
                        </>
                      )}
                    </span>
                  </div>
                  <span className={`pill ${impostor ? 'pill-red' : 'pill-cyan'}`}>{impostor ? 'Impostor' : 'Crewmate'}</span>
                </div>
              );
            })}
          </div>
        </section>

        {photoProofEnabled && photosByPlayer.length > 0 && (
          <section className="stack">
            <div className="section-header">
              <span className="label">Task proof</span>
              <div className="spacer" />
              <span className="faint tiny">Tap a photo to enlarge</span>
            </div>
            {photosByPlayer.map(({ playerName, photos: playerPhotos }) => (
              <div key={playerName} className="card stack-sm" style={{ padding: 12 }}>
                <div className="row-sm">
                  <Avatar name={playerName} size="sm" />
                  <span className="h3 truncate" style={{ flex: 1 }}>
                    {playerName}
                  </span>
                  <span className="pill">
                    <Camera size={11} />
                    {playerPhotos.length}
                  </span>
                </div>
                <div className="gallery">
                  {playerPhotos.map((p) => (
                    <button key={p.taskId} className="gallery-item" onClick={() => setViewing(p)}>
                      <img src={p.photoDataUrl} alt={p.taskText} loading="lazy" />
                      <span className="gallery-caption">{p.common ? "Everyone's task" : p.taskText}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <div className="screen-footer">
          {game.isHost ? (
            <button className="btn btn-primary btn-lg btn-block" onClick={game.playAgain}>
              <RotateCcw size={18} />
              Play again
            </button>
          ) : (
            <div className="card card-tight row" style={{ justifyContent: 'center', gap: 10 }}>
              <span className="pill pill-amber">
                <span className="live-dot" />
                Waiting
              </span>
              <span className="muted small">for the host to start the next round</span>
            </div>
          )}
          <button className="btn btn-ghost btn-block" onClick={game.leaveGame}>
            <LogOut size={17} />
            Leave
          </button>
        </div>
      </div>

      {viewing && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={viewing.taskText} onClick={() => setViewing(null)}>
          <img src={viewing.photoDataUrl} alt={viewing.taskText} />
          <div className="stack-xs center">
            <span className="h3">{viewing.playerName}</span>
            <span className="muted small">{viewing.common ? "Everyone's task" : viewing.taskText}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setViewing(null)}>
            <X size={16} />
            Close
          </button>
        </div>
      )}
    </>
  );
}
