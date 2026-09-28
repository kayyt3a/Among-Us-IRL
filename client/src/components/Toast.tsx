import { useEffect } from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useGame } from '../state/GameProvider';

const ICONS = { error: CircleAlert, warning: TriangleAlert, info: Info };

export default function Toast() {
  const { error, noticeKind, dismissError } = useGame();

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(dismissError, 4000);
    return () => clearTimeout(t);
  }, [error, dismissError]);

  if (!error) return null;
  const Icon = ICONS[noticeKind];
  return (
    <div className={`toast toast-${noticeKind}`} role="status" onClick={dismissError}>
      <Icon className="toast-icon" size={18} />
      <span>{error}</span>
    </div>
  );
}
