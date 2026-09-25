import { useEffect, useMemo, useState } from 'react';
import type { TaskPhoto } from '@irl-impostor/shared';
import { useGame } from '../state/GameProvider';

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export default function GameOver() {
  const game = useGame();
  const info = game.gameOver!;
  const crewWon = info.winner === 'crewmates';
  const photoProofEnabled = game.room?.settings.photoProofEnabled ?? false;
  const [photos, setPhotos] = useState<TaskPhoto[] | null>(null);

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

  return (
    <div className="app-shell stack">
      <div className="center stack" style={{ marginTop: 32 }}>
        <div style={{ fontSize: 56 }}>{crewWon ? '🏆' : '🔪'}</div>
        <h1 className="title">{crewWon ? 'Crewmates win!' : 'Impostors win!'}</h1>
        <p className="subtitle">
          {crewWon
            ? 'All impostors were caught, or every task got done.'
            : 'The impostors took over the house.'}
        </p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="card center" style={{ flex: 1, padding: 12 }}>
          <p className="subtitle" style={{ margin: 0 }}>
            Tasks done
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 0' }}>
            {info.tasksCompleted}/{info.tasksTotal}
          </p>
        </div>
        <div className="card center" style={{ flex: 1, padding: 12 }}>
          <p className="subtitle" style={{ margin: 0 }}>
            Game length
          </p>
          <p style={{ fontSize: 20, fontWeight: 800, margin: '4px 0 0' }}>
            {formatDuration(info.durationMs)}
          </p>
        </div>
      </div>

      <div className="card stack">
        <h3>Final roles</h3>
        {info.players.map((p) => {
          const wins = game.room?.players.find((rp) => rp.id === p.id)?.wins ?? 0;
          return (
            <div className="player-row" key={p.id}>
              <span>{p.name}</span>
              <div className="spacer" />
              {wins > 0 && <span className="badge">{wins} win{wins > 1 ? 's' : ''}</span>}
              {p.status === 'dead' && <span className="badge badge-dead">GHOST</span>}
              <span className={`badge ${p.role === 'impostor' ? 'badge-host' : ''}`}>
                {p.role === 'impostor' ? 'Impostor' : 'Crewmate'}
              </span>
            </div>
          );
        })}
      </div>

      {photoProofEnabled && photosByPlayer.length > 0 && (
        <div className="card stack">
          <h3>Task proof</h3>
          <p className="subtitle" style={{ margin: 0 }}>
            Every task photo, so you can check nobody skipped or faked a task
          </p>
          {photosByPlayer.map(({ playerName, photos: playerPhotos }) => (
            <div key={playerName} className="stack" style={{ gap: 6 }}>
              <span className="task-room">
                {playerName} ({playerPhotos.length})
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {playerPhotos.map((p) => (
                  <div key={p.taskId} className="stack" style={{ gap: 4 }}>
                    <img
                      src={p.photoDataUrl}
                      alt={p.taskText}
                      style={{ width: '100%', borderRadius: 12, display: 'block' }}
                    />
                    <span className="subtitle" style={{ fontSize: 11, textAlign: 'center' }}>
                      {p.common ? "Everyone's task" : p.taskText}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="spacer" />

      <div className="stack">
        {game.isHost ? (
          <button className="btn btn-primary btn-block" onClick={game.playAgain}>
            Play again
          </button>
        ) : (
          <p className="subtitle center">Waiting for the host to start a new round…</p>
        )}
        <button className="btn btn-ghost btn-block" onClick={game.leaveGame}>
          Leave
        </button>
      </div>
    </div>
  );
}
