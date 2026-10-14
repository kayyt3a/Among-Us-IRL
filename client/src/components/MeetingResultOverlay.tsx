import { useEffect, useMemo } from 'react';
import { CircleSlash, Gavel } from 'lucide-react';
import type { CastVote } from '@irl-impostor/shared';
import { useGame } from '../state/GameProvider';
import Avatar from './ui/Avatar';

const AUTO_DISMISS_MS = 7000;
/** Longer when there's a vote breakdown to read through. */
const AUTO_DISMISS_WITH_VOTES_MS = 14000;

/** Votes grouped by who they were for, most votes first, skips last. */
function groupVotes(votes: CastVote[]) {
  const groups = new Map<string, string[]>();
  for (const v of votes) groups.set(v.targetId, [...(groups.get(v.targetId) ?? []), v.voterName]);
  return Array.from(groups.entries())
    .map(([targetId, voters]) => ({ targetId, voters }))
    .sort((a, b) => (a.targetId === 'skip' ? 1 : b.targetId === 'skip' ? -1 : b.voters.length - a.voters.length));
}

export default function MeetingResultOverlay() {
  const { meetingResult, dismissMeetingResult, room } = useGame();
  const votes = useMemo(() => meetingResult?.votes ?? [], [meetingResult]);
  const dismissAfter = votes.length > 0 ? AUTO_DISMISS_WITH_VOTES_MS : AUTO_DISMISS_MS;

  useEffect(() => {
    if (!meetingResult) return;
    const t = setTimeout(dismissMeetingResult, dismissAfter);
    return () => clearTimeout(t);
  }, [meetingResult, dismissMeetingResult, dismissAfter]);

  const grouped = useMemo(() => groupVotes(votes), [votes]);

  if (!meetingResult) return null;

  const { eliminatedName, eliminatedRole, wasTie, overruledByName, judgeMisfired, roleHidden } = meetingResult;
  const wasImpostor = eliminatedRole === 'impostor';
  const nameOf = (id: string) => room?.players.find((p) => p.id === id)?.name ?? 'Someone';

  let hero;
  let title;
  let body;
  if (overruledByName) {
    hero = (
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
    // The ejected player's avatar drifts off into the dark before the verdict lands.
    hero = (
      <div className="eject-stage" aria-hidden="true">
        <div className="eject-drift">
          <Avatar name={eliminatedName} size="lg" />
        </div>
      </div>
    );
    title = `${eliminatedName} was voted out`;
    body = roleHidden ? (
      <>Their role stays a secret.</>
    ) : (
      <>
        {eliminatedName} was {wasImpostor ? 'an' : 'a'}{' '}
        <strong className={wasImpostor ? 'text-red' : 'text-cyan'}>{eliminatedRole}</strong>.
      </>
    );
  } else {
    hero = (
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
          <div style={{ display: 'grid', placeItems: 'center' }}>{hero}</div>
          <div className="stack-sm">
            <h2 className="h1">{title}</h2>
            <p className={`muted${eliminatedName && !overruledByName ? ' verdict' : ''}`}>{body}</p>
          </div>

          {grouped.length > 0 && (
            <div className="vote-breakdown" aria-label="Who voted for whom">
              <span className="label">Votes</span>
              {grouped.map(({ targetId, voters }) => (
                <div key={targetId} className="vote-row">
                  <span className="vote-target">
                    {targetId === 'skip' ? 'Skipped' : nameOf(targetId)}
                    <span className="vote-count">{voters.length}</span>
                  </span>
                  <span className="vote-voters">{voters.join(', ')}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary btn-block" onClick={dismissMeetingResult}>
            Continue
          </button>
          <span className="modal-timer" style={{ animationDuration: `${dismissAfter}ms` }} />
        </div>
      </div>
    </>
  );
}
