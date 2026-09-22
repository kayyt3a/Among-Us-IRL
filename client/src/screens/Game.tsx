import { useMemo, useState } from 'react';
import { useGame } from '../state/GameProvider';
import type { RoomType } from '@irl-impostor/shared';

const ROOM_LABELS: Record<RoomType, string> = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  'living-room': 'Living Room',
  bedroom: 'Bedroom',
  outdoor: 'Outdoor',
  'any-room': 'Anywhere',
};

export default function Game() {
  const game = useGame();
  const room = game.room!;
  const [killing, setKilling] = useState(false);
  const [editingSpot, setEditingSpot] = useState(false);
  const [spotDraft, setSpotDraft] = useState('');

  const grouped = useMemo(() => {
    const map = new Map<RoomType, typeof game.myTasks>();
    for (const t of game.myTasks) {
      const list = map.get(t.room) ?? [];
      list.push(t);
      map.set(t.room, list);
    }
    return Array.from(map.entries());
  }, [game.myTasks]);

  const doneCount = game.myTasks.filter((t) => t.done).length;
  const isImpostor = game.myRole === 'impostor';
  const killTargets = room.players.filter(
    (p) => p.id !== game.session?.playerId && p.status === 'alive'
  );

  return (
    <div className={`app-shell stack ${game.dead ? 'ghost-overlay' : ''}`}>
      <div className="row">
        <span className="badge">{room.code}</span>
        <div className="spacer" />
        <span className="subtitle">
          {doneCount}/{game.myTasks.length} tasks
        </span>
      </div>

      {game.dead ? (
        <div className="card center">
          <h2>👻 You are a ghost</h2>
          <p className="subtitle">
            Stay quiet. You can keep watching but can't call meetings or vote.
          </p>
        </div>
      ) : (
        <div className={`role-banner ${game.myRole ?? ''}`}>
          <h2 style={{ margin: 0 }}>{isImpostor ? 'You are the Impostor' : 'You are a Crewmate'}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.85 }}>
            {isImpostor
              ? 'Blend in. Fake your tasks. Eliminate crewmates when no one is looking.'
              : 'Complete your tasks around the house. Watch for anything suspicious.'}
          </p>
          {isImpostor && game.fellowImpostors.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Fellow impostor{game.fellowImpostors.length > 1 ? 's' : ''}:{' '}
              {game.fellowImpostors.map((f) => f.name).join(', ')}
            </p>
          )}
        </div>
      )}

      {isImpostor && !game.dead && (
        <div className="row">
          <button
            className="btn btn-danger btn-block"
            disabled={game.killAttempt.status === 'pending' || game.killAttempt.status === 'listening'}
            onClick={() => setKilling(true)}
          >
            Eliminate
          </button>
          <button
            className="btn btn-block"
            disabled={!room.ventAvailable}
            onClick={game.triggerVent}
          >
            {room.ventAvailable ? 'Vent (blackout)' : 'Vent unavailable'}
          </button>
        </div>
      )}

      <div className="stack">
        {grouped.map(([roomType, tasks]) => (
          <div key={roomType} className="stack" style={{ gap: 8 }}>
            <span className="task-room">{ROOM_LABELS[roomType]}</span>
            {tasks.map((t) => (
              <button
                key={t.taskId}
                className={`task-item ${t.done ? 'done' : ''}`}
                disabled={t.done || game.dead}
                onClick={() => game.completeTask(t.taskId)}
                style={{ textAlign: 'left', width: '100%', cursor: t.done ? 'default' : 'pointer' }}
              >
                <span className={`task-check ${t.done ? 'checked' : ''}`}>{t.done ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>{t.text}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="spacer" />

      {!game.dead && (
        <div className="stack" style={{ gap: 6 }}>
          {game.isHost ? (
            editingSpot ? (
              <div className="row">
                <input
                  className="field"
                  value={spotDraft}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setSpotDraft(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={!spotDraft.trim()}
                  onClick={() => {
                    game.updateSettings({ meetingSpot: spotDraft });
                    setEditingSpot(false);
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'center' }}
                onClick={() => {
                  setSpotDraft(room.settings.meetingSpot);
                  setEditingSpot(true);
                }}
              >
                Meeting spot: <strong style={{ color: 'var(--text)' }}>{room.settings.meetingSpot}</strong> · edit
              </button>
            )
          ) : (
            room.settings.meetingSpot && (
              <p className="subtitle" style={{ textAlign: 'center', margin: 0 }}>
                Meeting spot: <strong style={{ color: 'var(--text)' }}>{room.settings.meetingSpot}</strong>
              </p>
            )
          )}
          <button className="btn btn-block" onClick={() => game.callMeeting('emergency')}>
            Call meeting
          </button>
        </div>
      )}

      {killing && (
        <div
          className="toast"
          style={{ top: 0, bottom: 'auto', position: 'fixed', maxHeight: '80dvh', overflowY: 'auto' }}
        >
          <h3>Who did you eliminate?</h3>
          <div className="stack">
            {killTargets.length === 0 && <p className="subtitle">No one nearby to eliminate.</p>}
            {killTargets.map((p) => (
              <button
                key={p.id}
                className="btn btn-danger btn-block"
                onClick={() => {
                  game.attemptKill(p.id, p.name);
                  setKilling(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" onClick={() => setKilling(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(game.killAttempt.status === 'pending' || game.killAttempt.status === 'listening') && (
        <div className="toast" style={{ top: 0, bottom: 'auto', position: 'fixed' }}>
          <div className="stack center">
            <h3 style={{ margin: 0 }}>Verifying you're close to {game.killAttempt.targetName}…</h3>
            <p className="subtitle">
              {game.killAttempt.status === 'listening'
                ? 'Playing a quiet tone — stay near them and keep this screen open.'
                : 'Starting…'}
            </p>
            <button className="btn btn-ghost btn-block" onClick={game.cancelKillAttempt}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {game.killAttempt.status === 'failed' && (
        <div className="toast" style={{ top: 0, bottom: 'auto', position: 'fixed' }}>
          <div className="stack center">
            <h3 style={{ margin: 0 }}>Couldn't verify {game.killAttempt.targetName}</h3>
            <p className="subtitle">{game.killAttempt.reason ?? 'Get closer and try again.'}</p>
            <button
              className="btn btn-danger btn-block"
              onClick={() => game.attemptKill(game.killAttempt.targetId!, game.killAttempt.targetName!)}
            >
              Try again
            </button>
            <button
              className="btn btn-outline btn-block"
              onClick={() => {
                game.killPlayer(game.killAttempt.targetId!);
                game.cancelKillAttempt();
              }}
            >
              Eliminate anyway (skip check)
            </button>
            <button className="btn btn-ghost btn-block" onClick={game.cancelKillAttempt}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
