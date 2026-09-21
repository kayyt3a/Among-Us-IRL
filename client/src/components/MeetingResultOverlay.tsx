import { useEffect } from 'react';
import { useGame } from '../state/GameProvider';

export default function MeetingResultOverlay() {
  const { meetingResult, dismissMeetingResult } = useGame();

  useEffect(() => {
    if (!meetingResult) return;
    const t = setTimeout(dismissMeetingResult, 7000);
    return () => clearTimeout(t);
  }, [meetingResult, dismissMeetingResult]);

  if (!meetingResult) return null;

  const { eliminatedName, eliminatedRole, wasTie } = meetingResult;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,11,18,0.92)',
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="card stack center" style={{ maxWidth: 400 }}>
        {eliminatedName ? (
          <>
            <div style={{ fontSize: 40 }}>⚖️</div>
            <h2>{eliminatedName} was voted out</h2>
            <p className="subtitle">
              {eliminatedName} was a{' '}
              <strong style={{ color: eliminatedRole === 'impostor' ? 'var(--accent)' : 'var(--crew)' }}>
                {eliminatedRole}
              </strong>
              .
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40 }}>🤷</div>
            <h2>{wasTie ? 'Vote was tied' : 'No one was eliminated'}</h2>
            <p className="subtitle">The group couldn't agree.</p>
          </>
        )}
        <button className="btn btn-primary btn-block" onClick={dismissMeetingResult}>
          Continue
        </button>
      </div>
    </div>
  );
}
