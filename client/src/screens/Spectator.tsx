import { Crown, Eye, LogOut, MapPin, Siren } from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Avatar from '../components/ui/Avatar';

export default function Spectator() {
  const game = useGame();
  const room = game.room!;

  return (
    <div className="screen has-footer">
      <header className="row">
        <span className="pill pill-lg tabular">{room.code}</span>
        <div className="spacer" />
        <span className="pill pill-lg pill-cyan">
          <Eye size={14} />
          Spectating
        </span>
      </header>

      <div className="stack center" style={{ alignItems: 'center', gap: 16, paddingTop: 16 }}>
        <div className="icon-circle xl cyan">
          <Eye size={38} />
        </div>
        <div className="stack-sm">
          <h1 className="h1">You're watching this round</h1>
          <p className="muted" style={{ maxWidth: 320, margin: '0 auto' }}>
            You joined after it started, so you'll be dealt in from the next round.
          </p>
        </div>
      </div>

      {room.meeting && (
        <div className="card card-amber row" style={{ gap: 12 }}>
          <div className="icon-circle amber">
            <Siren size={20} />
          </div>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <span className="label">Meeting in progress</span>
            {room.settings.meetingSpot && (
              <span className="h3 text-amber row-sm">
                <MapPin size={14} />
                <span className="truncate">{room.settings.meetingSpot}</span>
              </span>
            )}
          </div>
        </div>
      )}

      <section className="stack-sm">
        <div className="section-header">
          <span className="label">In the room</span>
        </div>
        <div className="list">
          {room.players.map((p) => (
            <div className="list-row" key={p.id}>
              <Avatar name={p.name} />
              <span className="list-row-title truncate" style={{ flex: 1 }}>
                {p.name}
                {p.id === game.session?.playerId && <span className="faint"> (you)</span>}
              </span>
              {p.isHost && (
                <span className="pill pill-amber">
                  <Crown size={11} />
                  Host
                </span>
              )}
              {p.isSpectator && (
                <span className="pill">
                  <Eye size={11} />
                  Watching
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="screen-footer">
        <button className="btn btn-ghost btn-block" onClick={game.leaveGame}>
          <LogOut size={17} />
          Leave
        </button>
      </div>
    </div>
  );
}
