import { useGame } from '../state/GameProvider';

export default function GameOver() {
  const game = useGame();
  const info = game.gameOver!;
  const crewWon = info.winner === 'crewmates';

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

      <div className="card stack">
        <h3>Final roles</h3>
        {info.players.map((p) => (
          <div className="player-row" key={p.id}>
            <span>{p.name}</span>
            <div className="spacer" />
            {p.status === 'dead' && <span className="badge badge-dead">GHOST</span>}
            <span className={`badge ${p.role === 'impostor' ? 'badge-host' : ''}`}>
              {p.role === 'impostor' ? 'Impostor' : 'Crewmate'}
            </span>
          </div>
        ))}
      </div>

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
