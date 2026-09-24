import { useGame } from '../state/GameProvider';

export default function Spectator() {
  const game = useGame();
  const room = game.room!;

  return (
    <div className="app-shell stack">
      <div className="row">
        <span className="badge">{room.code}</span>
        <div className="spacer" />
        <span className="badge">SPECTATING</span>
      </div>

      <div className="center stack" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 48 }}>👀</div>
        <h1 className="title">You're spectating this round</h1>
        <p className="subtitle">
          You joined after the round started, so you're just watching for now — you'll play from
          the next round on.
        </p>
      </div>

      {room.meeting && (
        <div className="card center" style={{ borderColor: 'var(--warn)' }}>
          <p className="subtitle" style={{ margin: 0 }}>
            A meeting is underway
          </p>
          {room.settings.meetingSpot && (
            <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--warn)', margin: '4px 0 0' }}>
              {room.settings.meetingSpot}
            </p>
          )}
        </div>
      )}

      <div className="card stack">
        <h3>Players</h3>
        <div className="stack">
          {room.players.map((p) => (
            <div className="player-row" key={p.id}>
              <span>{p.name}</span>
              {p.isHost && <span className="badge badge-host">HOST</span>}
              {p.isSpectator && <span className="badge">SPECTATING</span>}
              {p.id === game.session?.playerId && <span className="badge">YOU</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="spacer" />
      <button className="btn btn-ghost btn-block" onClick={game.leaveGame}>
        Leave
      </button>
    </div>
  );
}
