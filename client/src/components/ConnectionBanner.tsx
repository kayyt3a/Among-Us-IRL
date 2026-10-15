import { useEffect, useState } from 'react';
import { LoaderCircle, WifiOff } from 'lucide-react';
import { useGame } from '../state/GameProvider';

/** How long a drop has to last before the banner shows, so a blip doesn't flash it. */
const SHOW_AFTER_MS = 1200;

/**
 * Tells players their phone has lost the game, instead of the screen just
 * freezing. The connection and the rejoin happen on their own; this only
 * explains what's going on until they do.
 */
export default function ConnectionBanner() {
  const { connected, session } = useGame();
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [visible, setVisible] = useState(false);
  // The phone saying it's offline is the quickest signal; the socket itself
  // can take a while to notice a dead connection.
  const dropped = !!session && (!connected || offline);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (!dropped) return;
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => {
      clearTimeout(t);
      setVisible(false);
    };
  }, [dropped]);

  if (!dropped || !visible) return null;
  return (
    <div className="connection-banner" role="status" aria-live="polite">
      {offline ? <WifiOff size={16} /> : <LoaderCircle className="spin" size={16} />}
      <span>
        {offline ? "You're offline. We'll put you back in your game when you reconnect." : 'Reconnecting to your game…'}
      </span>
    </div>
  );
}
