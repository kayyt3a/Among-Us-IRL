import { useGame } from '../state/GameProvider';

export default function Lobby() {
  const game = useGame();
  const room = game.room!;
  const settings = room.settings;
  const maxImpostors = Math.max(1, Math.floor(room.players.length / 3));

  return (
    <div className="app-shell stack">
      <div className="row">
        <button className="btn btn-sm" onClick={game.leaveGame}>
          Leave
        </button>
        <div className="spacer" />
        <span className="badge">{room.players.length} players</span>
      </div>

      <div className="center stack">
        <p className="subtitle">Room code</p>
        <div className="room-code">{room.code}</div>
        <p className="subtitle">Everyone joins at this address using this code</p>
      </div>

      <div className="card stack">
        <h3>Players</h3>
        <div className="stack">
          {room.players.map((p) => (
            <div className="player-row" key={p.id}>
              <span>{p.name}</span>
              {p.isHost && <span className="badge badge-host">HOST</span>}
              {p.id === game.session?.playerId && <span className="badge">YOU</span>}
            </div>
          ))}
        </div>
      </div>

      {game.isHost ? (
        <div className="card stack">
          <h3>Settings</h3>
          <div className="row">
            <span className="subtitle">Tasks per player</span>
            <div className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() => game.updateSettings({ tasksPerPlayer: settings.tasksPerPlayer - 1 })}
              disabled={settings.tasksPerPlayer <= 3}
            >
              −
            </button>
            <strong style={{ width: 24, textAlign: 'center' }}>{settings.tasksPerPlayer}</strong>
            <button
              className="btn btn-sm"
              onClick={() => game.updateSettings({ tasksPerPlayer: settings.tasksPerPlayer + 1 })}
              disabled={settings.tasksPerPlayer >= 8}
            >
              +
            </button>
          </div>
          <div className="row">
            <span className="subtitle">Impostors</span>
            <div className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() => game.updateSettings({ impostorCount: settings.impostorCount - 1 })}
              disabled={settings.impostorCount <= 1}
            >
              −
            </button>
            <strong style={{ width: 24, textAlign: 'center' }}>{settings.impostorCount}</strong>
            <button
              className="btn btn-sm"
              onClick={() => game.updateSettings({ impostorCount: settings.impostorCount + 1 })}
              disabled={settings.impostorCount >= maxImpostors}
            >
              +
            </button>
          </div>
        </div>
      ) : (
        <p className="subtitle center">Waiting for the host to start the game…</p>
      )}

      <div className="spacer" />

      {game.isHost && (
        <button
          className="btn btn-primary btn-block"
          disabled={room.players.length < 3}
          onClick={game.startGame}
        >
          {room.players.length < 3 ? 'Need at least 3 players' : 'Start game'}
        </button>
      )}
    </div>
  );
}
