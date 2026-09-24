import type { ReactNode } from 'react';
import { useGame } from './state/GameProvider';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import Meeting from './screens/Meeting';
import GameOver from './screens/GameOver';
import Spectator from './screens/Spectator';
import BlackoutOverlay from './components/BlackoutOverlay';
import Toast from './components/Toast';
import MeetingResultOverlay from './components/MeetingResultOverlay';

export default function App() {
  const game = useGame();

  let screen: ReactNode;
  if (game.connecting) {
    screen = (
      <div className="app-shell center" style={{ justifyContent: 'center' }}>
        <p className="subtitle">Connecting…</p>
      </div>
    );
  } else if (!game.session || !game.room) {
    screen = <Home />;
  } else if (game.gameOver) {
    screen = <GameOver />;
  } else if (game.room.phase === 'lobby') {
    screen = <Lobby />;
  } else if (game.me?.isSpectator) {
    screen = <Spectator />;
  } else if (game.room.phase === 'meeting') {
    screen = <Meeting />;
  } else {
    screen = <Game />;
  }

  return (
    <>
      {screen}
      <MeetingResultOverlay />
      <BlackoutOverlay />
      <Toast />
    </>
  );
}
