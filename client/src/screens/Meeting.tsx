import { useState } from 'react';
import { useGame } from '../state/GameProvider';
import Countdown from '../components/Countdown';
import SabotagePuzzleCard from '../components/SabotagePuzzleCard';
import SpecialRoleBadge from '../components/SpecialRoleBadge';

export default function Meeting() {
  const game = useGame();
  const room = game.room!;
  const meeting = room.meeting!;
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [overruling, setOverruling] = useState(false);

  const me = game.me;
  const iAmAlive = me?.status === 'alive';
  const alivePlayers = room.players.filter((p) => p.status === 'alive');
  const hasVoted = votedFor !== null || (!!me && meeting.votedPlayerIds.includes(me.id));
  const canOverrule =
    game.mySpecialRole === 'judge' && iAmAlive && !game.specialRoleUsed && meeting.phase === 'voting';

  function vote(targetId: string | 'skip') {
    if (hasVoted || !iAmAlive) return;
    setVotedFor(targetId);
    game.castVote(targetId);
  }

  return (
    <div className="app-shell stack">
      <div className="center stack">
        <div style={{ fontSize: 40 }}>{meeting.reason === 'report' ? '💀' : '🚨'}</div>
        <h1 className="title">Meeting called</h1>
        <p className="subtitle">by {meeting.calledByName}</p>
      </div>

      {room.settings.meetingSpot && (
        <div
          className="card center"
          style={{ borderColor: 'var(--warn)', background: 'rgba(245, 185, 66, 0.08)' }}
        >
          <p className="subtitle" style={{ margin: 0 }}>
            Everyone return to
          </p>
          <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--warn)', margin: '4px 0 0' }}>
            {room.settings.meetingSpot}
          </p>
        </div>
      )}

      {room.sabotagePuzzle && <SabotagePuzzleCard puzzle={room.sabotagePuzzle} />}

      {meeting.phase === 'discussion' && (
        <div className="card center stack">
          <p className="subtitle">Discuss out loud. Voting opens in</p>
          <div style={{ fontSize: 40 }}>
            <Countdown endsAt={meeting.discussionEndsAt} />
          </div>
        </div>
      )}

      {meeting.phase === 'voting' && (
        <>
          <div className="card center stack">
            <p className="subtitle">Voting ends in</p>
            <div style={{ fontSize: 32 }}>
              <Countdown endsAt={meeting.votingEndsAt} />
            </div>
          </div>

          {!iAmAlive ? (
            <p className="subtitle center">You're a ghost. You can watch, but not vote.</p>
          ) : hasVoted ? (
            <p className="subtitle center">
              Vote cast. Waiting for others ({meeting.votedPlayerIds.length}/{alivePlayers.length})…
            </p>
          ) : (
            <div className="stack">
              {alivePlayers
                .filter((p) => p.id !== me?.id)
                .map((p) => (
                  <button key={p.id} className="btn btn-block" onClick={() => vote(p.id)}>
                    {p.name}
                  </button>
                ))}
              <button key="self" className="btn btn-block" onClick={() => vote(me!.id)}>
                {me?.name} (yourself)
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => vote('skip')}>
                Skip vote
              </button>
            </div>
          )}

          {canOverrule && (
            <div className="stack center">
              <SpecialRoleBadge role="judge" />
              <button className="btn btn-outline btn-block" onClick={() => setOverruling(true)}>
                Overrule the vote
              </button>
            </div>
          )}
        </>
      )}

      {overruling && (
        <div
          className="toast"
          style={{ top: 0, bottom: 'auto', position: 'fixed', maxHeight: '80dvh', overflowY: 'auto' }}
        >
          <h3>Force-eject who?</h3>
          <p className="subtitle">
            One shot only. If they're not the impostor, you're ejected instead.
          </p>
          <div className="stack">
            {alivePlayers
              .filter((p) => p.id !== me?.id)
              .map((p) => (
                <button
                  key={p.id}
                  className="btn btn-danger btn-block"
                  onClick={() => {
                    game.judgeOverrule(p.id);
                    setOverruling(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
            <button className="btn btn-ghost btn-block" onClick={() => setOverruling(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
