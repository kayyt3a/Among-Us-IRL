import { useEffect } from 'react';
import { useGame } from '../state/GameProvider';

export default function Toast() {
  const { error, dismissError } = useGame();

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(dismissError, 4000);
    return () => clearTimeout(t);
  }, [error, dismissError]);

  if (!error) return null;
  return (
    <div className="toast" onClick={dismissError}>
      <p className="error-text" style={{ margin: 0 }}>
        {error}
      </p>
    </div>
  );
}
