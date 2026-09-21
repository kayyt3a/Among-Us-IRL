import { useEffect, useState } from 'react';
import { useGame } from '../state/GameProvider';

export default function BlackoutOverlay() {
  const { ventNonce, ventDurationMs } = useGame();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (ventNonce === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), ventDurationMs);
    return () => clearTimeout(t);
  }, [ventNonce, ventDurationMs]);

  if (!visible) return null;
  return <div className="blackout" />;
}
