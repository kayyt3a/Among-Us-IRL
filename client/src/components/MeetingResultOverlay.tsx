import { useEffect } from 'react';
import { CircleSlash, Gavel, UserX } from 'lucide-react';
import { useGame } from '../state/GameProvider';

const AUTO_DISMISS_MS = 7000;

export default function MeetingResultOverlay() {
  const { meetingResult, dismissMeetingResult } = useGame();

  useEffect(() => {
    if (!meetingResult) return;
    const t = setTimeout(dismissMeetingResult, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [meetingResult, dismissMeetingResult]);

  if (!meetingResult) return null;

  const { eliminatedName, eliminatedRole, wasTie, overruledByName, judgeMisfired } = meetingResult;
  const wasImpostor = eliminatedRole === 'impostor';

  let icon;
  let title;
  let body;
  if (overruledByName) {
    icon = (
      <div className="icon-circle lg" style={{ background: 'rgba(167,139,250,0.14)', color: 'var(--judge)' }}>
        <Gavel size={30} />
      </div>
    );
    title = `${overruledByName} overruled the vote`;
    body = judgeMisfired ? (
      <>{eliminatedName} wasn't the impostor, so the Judge is ejected instead.</>
    ) : (
      <>
        {eliminatedName} was ejected, and was the <strong className="text-red">impostor</strong>.
      </>
    );
  } else if (eliminatedName) {
    icon = (
      <div className={`icon-circle lg ${wasImpostor ? 'red' : 'cyan'}`}>
        <UserX size={30} />
      </div>
    );
    title = `${eliminatedName} was voted out`;
    body = (
      <>
        {eliminatedName} was {wasImpostor ? 'an' : 'a'}{' '}
        <strong className={wasImpostor ? 'text-red' : 'text-cyan'}>{eliminatedRole}</strong>.
      </>
    );
  } else {
    icon = (
      <div className="icon-circle lg">
        <CircleSlash size={30} />
      </div>
    );
    title = wasTie ? 'The vote was tied' : 'No one was ejected';
    body = <>The group couldn't agree, so everyone stays in.</>;
  }

  return (
    <>
      <div className="backdrop" style={{ zIndex: 790 }} />
      <div className="modal-host">
        <div className="modal stack center" role="alertdialog" aria-modal="true" aria-label={title} style={{ gap: 16 }}>
          <div style={{ display: 'grid', placeItems: 'center' }}>{icon}</div>
          <div className="stack-sm">
            <h2 className="h1">{title}</h2>
            <p className="muted">{body}</p>
          </div>
          <button className="btn btn-primary btn-block" onClick={dismissMeetingResult}>
            Continue
          </button>
          <span className="modal-timer" style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} />
        </div>
      </div>
    </>
  );
}
