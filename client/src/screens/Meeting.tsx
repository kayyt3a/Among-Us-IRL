import { useState } from 'react';
import { Check, CircleSlash, Eye, Gavel, MapPin, Siren, Skull } from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Countdown from '../components/Countdown';
import SabotagePuzzleCard from '../components/SabotagePuzzleCard';
import SpecialRoleBadge from '../components/SpecialRoleBadge';
import Avatar from '../components/ui/Avatar';
import Sheet from '../components/ui/Sheet';

export default function Meeting() {
  const game = useGame();
  const room = game.room!;
  const meeting = room.meeting!;
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [overruling, setOverruling] = useState(false);

  const me = game.me;
  const iAmAlive = me?.status === 'alive';
  // Mid-round spectators can't vote or be voted for.
  const roundPlayers = room.players.filter((p) => !p.isSpectator);
  const spectators = room.players.filter((p) => p.isSpectator);
  const alivePlayers = roundPlayers.filter((p) => p.status === 'alive');
  const hasVoted = votedFor !== null || (!!me && meeting.votedPlayerIds.includes(me.id));
  const canOverrule = game.mySpecialRole === 'judge' && iAmAlive && !game.specialRoleUsed && meeting.phase === 'voting';
  const isReport = meeting.reason === 'report';

  function vote(targetId: string | 'skip') {
    if (hasVoted || !iAmAlive) return;
    setVotedFor(targetId);
    game.castVote(targetId);
  }

  return (
    <>
      <div className="screen">
        <header className="stack center" style={{ alignItems: 'center', gap: 16, paddingTop: 12 }}>
          <div className="icon-circle xl amber siren">{isReport ? <Skull size={38} /> : <Siren size={38} />}</div>
          <div className="stack-xs">
            <h1 className="h1">{isReport ? 'Body reported' : 'Emergency meeting'}</h1>
            <p className="muted">
              Called by <strong style={{ color: 'var(--text)' }}>{meeting.calledByName}</strong>
            </p>
          </div>
        </header>

        {room.settings.meetingSpot && (
          <div className="card card-amber row" style={{ gap: 12 }}>
            <div className="icon-circle amber">
              <MapPin size={20} />
            </div>
            <div className="stack-xs" style={{ minWidth: 0 }}>
              <span className="label">Everyone head to</span>
              <span className="h2 text-amber truncate">{room.settings.meetingSpot}</span>
            </div>
          </div>
        )}

        {room.sabotagePuzzle && <SabotagePuzzleCard puzzle={room.sabotagePuzzle} />}

        {meeting.phase === 'discussion' && (
          <>
            <div className="card stack-sm center" style={{ padding: 20 }}>
              <span className="label">Discussion</span>
              <span className="phase-timer timer">
                <Countdown endsAt={meeting.discussionEndsAt} />
              </span>
              <p className="muted small">Talk it out. Voting opens when this hits zero.</p>
            </div>

            <section className="stack-sm">
              <div className="section-header">
                <span className="label">Who's here</span>
                <div className="spacer" />
                <span className="faint tiny">{alivePlayers.length} alive</span>
              </div>
              <div className="list">
                {[...roundPlayers, ...spectators].map((p) => {
                  const dead = p.status !== 'alive';
                  return (
                    <div className="list-row" key={p.id}>
                      <Avatar name={p.name} dead={dead} />
                      <span className={`list-row-title truncate${dead ? ' faint' : ''}`} style={{ flex: 1 }}>
                        {p.name}
                        {p.id === me?.id && <span className="faint"> (you)</span>}
                      </span>
                      {p.isSpectator ? (
                        <span className="pill">
                          <Eye size={12} />
                          Watching
                        </span>
                      ) : (
                        dead && (
                          <span className="pill">
                            <Skull size={12} />
                            Dead
                          </span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {meeting.phase === 'voting' && (
          <>
            <div className="card stack-sm center" style={{ padding: 20 }}>
              <span className="label">Voting</span>
              <span className="phase-timer timer">
                <Countdown endsAt={meeting.votingEndsAt} />
              </span>
              <p className="muted small tabular">
                {meeting.votedPlayerIds.length} of {alivePlayers.length} votes in
              </p>
            </div>

            {!iAmAlive ? (
              <div className="card center muted">You're a ghost. You can watch, but not vote.</div>
            ) : (
              <section className="stack-sm">
                <div className="section-header">
                  <span className="label">{hasVoted ? 'Vote locked in' : 'Who is the impostor?'}</span>
                </div>
                {roundPlayers.map((p) => {
                  const dead = p.status !== 'alive';
                  const voted = meeting.votedPlayerIds.includes(p.id);
                  const selected = votedFor === p.id;
                  if (dead) {
                    return (
                      <button key={p.id} className="choice" disabled>
                        <Avatar name={p.name} dead />
                        {p.name}
                        <span className="choice-trailing small">
                          <Skull size={15} />
                          Dead
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={p.id}
                      className={`choice${selected ? ' selected' : ''}${hasVoted && !selected ? ' dimmed' : ''}`}
                      aria-pressed={selected}
                      onClick={() => vote(p.id)}
                    >
                      <Avatar name={p.name} />
                      <span className="truncate">
                        {p.name}
                        {p.id === me?.id && <span className="faint"> (you)</span>}
                      </span>
                      <span className="choice-trailing">
                        {voted && (
                          <span className="pill pill-green">
                            <Check size={12} strokeWidth={3} />
                            Voted
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                <button
                  className={`choice${votedFor === 'skip' ? ' selected' : ''}${hasVoted && votedFor !== 'skip' ? ' dimmed' : ''}`}
                  aria-pressed={votedFor === 'skip'}
                  onClick={() => vote('skip')}
                >
                  <span className="icon-circle" style={{ width: 36, height: 36, borderRadius: '50%' }}>
                    <CircleSlash size={18} />
                  </span>
                  Skip vote
                </button>
              </section>
            )}

            {canOverrule && (
              <div className="card stack" style={{ borderColor: 'rgba(167,139,250,0.4)' }}>
                <div className="row">
                  <SpecialRoleBadge role="judge" />
                  <div className="spacer" />
                </div>
                <p className="muted small">You can override the group's vote once. If you pick an innocent, you're ejected instead.</p>
                <button className="btn btn-secondary btn-block" onClick={() => setOverruling(true)}>
                  <Gavel size={18} color="var(--judge)" />
                  Overrule the vote
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {overruling && (
        <Sheet
          title="Force-eject who?"
          description="One shot only. If they're not the impostor, you're ejected instead."
          icon={
            <div className="icon-circle" style={{ background: 'rgba(167,139,250,0.14)', color: 'var(--judge)' }}>
              <Gavel size={20} />
            </div>
          }
          onClose={() => setOverruling(false)}
        >
          <div className="stack-sm">
            {alivePlayers
              .filter((p) => p.id !== me?.id)
              .map((p) => (
                <button
                  key={p.id}
                  className="choice danger"
                  onClick={() => {
                    game.judgeOverrule(p.id);
                    setOverruling(false);
                  }}
                >
                  <Avatar name={p.name} />
                  {p.name}
                </button>
              ))}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setOverruling(false)}>
            Cancel
          </button>
        </Sheet>
      )}
    </>
  );
}
