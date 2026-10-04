import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useGame } from './state/GameProvider';
import Logo from './components/ui/Logo';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import Meeting from './screens/Meeting';
import GameOver from './screens/GameOver';
import Spectator from './screens/Spectator';
import BlackoutOverlay from './components/BlackoutOverlay';
import Toast from './components/Toast';
import MeetingResultOverlay from './components/MeetingResultOverlay';
import { useScreenWakeLock } from './utils/wakeLock';

export default function App() {
  const game = useGame();
  // Keep the screen on for as long as you're in a room, lobby included, so the
  // host's room code stays visible and nobody's phone locks mid-round.
  useScreenWakeLock(!!game.session && !!game.room);

  let screen: ReactNode;
  if (game.connecting) {
    screen = (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 20 }}>
        <Logo size={64} />
        <div className="row-sm muted small">
          <LoaderCircle className="spin" size={16} />
          Connecting
        </div>
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
