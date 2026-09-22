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

      <div className="card stack">
        <h3>Meeting spot</h3>
        <p className="subtitle">
          Everyone agrees on one real spot in the house — the couch, the kitchen table — and
          heads there the moment a meeting is called.
        </p>
        {game.isHost ? (
          <input
            className="field"
            placeholder="e.g. Living room couch"
            value={settings.meetingSpot}
            maxLength={40}
            onChange={(e) => game.updateSettings({ meetingSpot: e.target.value })}
          />
        ) : (
          <p style={{ margin: 0, fontWeight: 700 }}>
            {settings.meetingSpot || 'Waiting for the host to set one…'}
          </p>
        )}
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
          <div className="row">
            <div>
              <span className="subtitle" style={{ display: 'block' }}>
                Judge
              </span>
              <span className="subtitle" style={{ fontSize: 12 }}>
                One crewmate can force-eject once — wrong guess ejects them instead
              </span>
            </div>
            <div className="spacer" />
            <button
              className={`btn btn-sm ${settings.judgeEnabled ? 'btn-primary' : ''}`}
              onClick={() => game.updateSettings({ judgeEnabled: !settings.judgeEnabled })}
            >
              {settings.judgeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="row">
            <div>
              <span className="subtitle" style={{ display: 'block' }}>
                Guardian Angel
              </span>
              <span className="subtitle" style={{ fontSize: 12 }}>
                One crewmate can shield a player from a kill, once they've died
              </span>
            </div>
            <div className="spacer" />
            <button
              className={`btn btn-sm ${settings.guardianAngelEnabled ? 'btn-primary' : ''}`}
              onClick={() => game.updateSettings({ guardianAngelEnabled: !settings.guardianAngelEnabled })}
            >
              {settings.guardianAngelEnabled ? 'ON' : 'OFF'}
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
          disabled={room.players.length < 3 || !settings.meetingSpot.trim()}
          onClick={game.startGame}
        >
          {room.players.length < 3
            ? 'Need at least 3 players'
            : !settings.meetingSpot.trim()
              ? 'Set a meeting spot to start'
              : 'Start game'}
        </button>
      )}
    </div>
  );
}
