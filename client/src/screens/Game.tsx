import { useMemo, useRef, useState } from 'react';
import { useGame } from '../state/GameProvider';
import type { RoomType } from '@irl-impostor/shared';
import Countdown from '../components/Countdown';
import SabotagePuzzleCard from '../components/SabotagePuzzleCard';
import SpecialRoleBadge from '../components/SpecialRoleBadge';
import { downscaleImageToDataUrl } from '../utils/image';

const ROOM_LABELS: Record<RoomType, string> = {
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  'living-room': 'Living Room',
  bedroom: 'Bedroom',
  outdoor: 'Outdoor',
  'any-room': 'Anywhere',
};

export default function Game() {
  const game = useGame();
  const room = game.room!;
  const [killing, setKilling] = useState(false);
  const [editingSpot, setEditingSpot] = useState(false);
  const [spotDraft, setSpotDraft] = useState('');
  const [protecting, setProtecting] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [roleHidden, setRoleHidden] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const commonTask = game.myTasks.find((t) => t.common) ?? null;
  const photoProofEnabled = room.settings.photoProofEnabled;

  function handleTaskClick(taskId: string, done: boolean) {
    if (done || uploadingTaskId) return;
    if (photoProofEnabled) {
      setUploadingTaskId(taskId);
      photoInputRef.current?.click();
    } else {
      game.completeTask(taskId);
    }
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const taskId = uploadingTaskId;
    if (!file || !taskId) {
      setUploadingTaskId(null);
      return;
    }
    setPhotoError(null);
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      const res = await game.submitTaskPhoto(taskId, dataUrl);
      if (!res.ok) setPhotoError(res.error ?? 'Could not submit the photo.');
    } catch {
      setPhotoError('Could not process that photo.');
    } finally {
      setUploadingTaskId(null);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<RoomType, typeof game.myTasks>();
    for (const t of game.myTasks) {
      if (t.common) continue;
      const list = map.get(t.room) ?? [];
      list.push(t);
      map.set(t.room, list);
    }
    return Array.from(map.entries());
  }, [game.myTasks]);

  const doneCount = game.myTasks.filter((t) => t.done).length;
  const isImpostor = game.myRole === 'impostor';
  const killTargets = room.players.filter(
    (p) => p.id !== game.session?.playerId && p.status === 'alive'
  );
  const protectTargets = room.players.filter((p) => p.status === 'alive');

  const sabotageReady =
    game.sabotageUsesRemaining > 0 && Date.now() >= game.sabotageAvailableAt && !room.sabotagePuzzle;
  const killReady = Date.now() >= game.killAvailableAt;
  const canGuardianProtect =
    game.dead && game.mySpecialRole === 'guardian-angel' && !game.specialRoleUsed;
  const canSheriffShoot =
    !game.dead && game.mySpecialRole === 'sheriff' && !game.specialRoleUsed;
  const canEngineerVent =
    !game.dead && game.mySpecialRole === 'engineer' && !game.specialRoleUsed;
  const shootTargets = room.players.filter(
    (p) => p.id !== game.session?.playerId && p.status === 'alive'
  );

  return (
    <div className={`app-shell stack ${game.dead ? 'ghost-overlay' : ''}`}>
      <div className="row">
        <span className="badge">{room.code}</span>
        <div className="spacer" />
        <span className="subtitle">
          {doneCount}/{game.myTasks.length} tasks
        </span>
      </div>

      {room.gameEndsAt && (
        <div className="card center" style={{ padding: 12 }}>
          <p className="subtitle" style={{ margin: 0 }}>
            Time left
          </p>
          <div style={{ fontSize: 26 }}>
            <Countdown endsAt={room.gameEndsAt} urgentBelowMs={30_000} />
          </div>
        </div>
      )}

      {room.crewTaskProgress.total > 0 && (
        <div className="card stack-sm" style={{ padding: 12, gap: 6 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="subtitle" style={{ margin: 0 }}>
              Crew tasks
            </span>
            <div className="spacer" />
            <span className="subtitle" style={{ margin: 0 }}>
              {room.crewTaskProgress.done}/{room.crewTaskProgress.total}
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round((room.crewTaskProgress.done / room.crewTaskProgress.total) * 100)}%`,
                background: 'var(--good)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {room.sabotagePuzzle && <SabotagePuzzleCard puzzle={room.sabotagePuzzle} />}

      {game.dead ? (
        <div className="card center">
          <h2>👻 You are a ghost</h2>
          <p className="subtitle">
            Stay quiet. You can keep watching, finish your own tasks, but can't call meetings or
            vote.
          </p>
          {canGuardianProtect && (
            <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => setProtecting(true)}>
              Protect a player
            </button>
          )}
        </div>
      ) : roleHidden ? (
        <button
          className="card row"
          style={{ padding: 14, width: '100%', cursor: 'pointer', border: '1px dashed var(--border)' }}
          onClick={() => setRoleHidden(false)}
        >
          <span className="subtitle" style={{ margin: 0 }}>Role hidden</span>
          <div className="spacer" />
          <span
            aria-hidden="true"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            +
          </span>
        </button>
      ) : (
        <div className={`role-banner ${game.myRole ?? ''}`}>
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: -6 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '4px 10px', color: 'inherit' }}
              onClick={() => setRoleHidden(true)}
              aria-label="Hide role"
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '1px solid currentColor',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: 1,
                  marginRight: 4,
                }}
              >
                −
              </span>
              Hide
            </button>
          </div>
          <h2 style={{ margin: 0 }}>{isImpostor ? 'You are the Impostor' : 'You are a Crewmate'}</h2>
          <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.85 }}>
            {isImpostor
              ? 'Blend in. Fake your tasks. Eliminate crewmates when no one is looking.'
              : 'Complete your tasks around the house. Watch for anything suspicious.'}
          </p>
          {isImpostor && game.fellowImpostors.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 13 }}>
              Fellow impostor{game.fellowImpostors.length > 1 ? 's' : ''}:{' '}
              {game.fellowImpostors.map((f) => f.name).join(', ')}
            </p>
          )}
          {!isImpostor && game.mySpecialRole && (
            <>
              <div>
                <SpecialRoleBadge role={game.mySpecialRole} />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                {game.mySpecialRole === 'judge' &&
                  'During a vote you can overrule the result once.'}
                {game.mySpecialRole === 'guardian-angel' &&
                  'Once you die, you can shield a living player once.'}
                {game.mySpecialRole === 'sheriff' &&
                  'You can shoot a suspect once, and guessing wrong gets you eliminated instead.'}
                {game.mySpecialRole === 'engineer' &&
                  'You can trigger a decoy blackout vent once, for misdirection.'}
              </p>
            </>
          )}
        </div>
      )}

      {isImpostor && !game.dead && (
        <div className="card stack-sm" style={{ padding: 12, gap: 8 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="subtitle" style={{ margin: 0 }}>Eliminate</span>
            <div className="spacer" />
            {killReady ? (
              <span className="badge" style={{ color: 'var(--good)', borderColor: 'var(--good)' }}>Ready</span>
            ) : (
              <span className="timer" style={{ fontSize: 15 }}>
                <Countdown endsAt={game.killAvailableAt} />
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="subtitle" style={{ margin: 0 }}>Vent</span>
            <div className="spacer" />
            {room.ventAvailable && room.ventEndsAt ? (
              <span className="timer" style={{ fontSize: 15 }}>
                closes in <Countdown endsAt={room.ventEndsAt} />
              </span>
            ) : (
              <span className="subtitle" style={{ margin: 0 }}>After a kill</span>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span className="subtitle" style={{ margin: 0 }}>Sabotage</span>
            <div className="spacer" />
            {game.sabotageUsesRemaining <= 0 ? (
              <span className="subtitle" style={{ margin: 0 }}>None left</span>
            ) : room.sabotagePuzzle ? (
              <span className="subtitle" style={{ margin: 0 }}>In progress</span>
            ) : sabotageReady ? (
              <span className="badge" style={{ color: 'var(--good)', borderColor: 'var(--good)' }}>
                Ready ({game.sabotageUsesRemaining})
              </span>
            ) : (
              <span className="timer" style={{ fontSize: 15 }}>
                <Countdown endsAt={game.sabotageAvailableAt} />
              </span>
            )}
          </div>
        </div>
      )}

      {isImpostor && !game.dead && (
        <div className="row">
          <button
            className="btn btn-danger btn-block"
            disabled={
              !killReady || game.killAttempt.status === 'pending' || game.killAttempt.status === 'listening'
            }
            onClick={() => setKilling(true)}
          >
            {killReady ? 'Eliminate' : 'Eliminate unavailable'}
          </button>
          <button className="btn btn-block" disabled={!room.ventAvailable} onClick={game.triggerVent}>
            {room.ventAvailable ? 'Vent (blackout)' : 'Vent unavailable'}
          </button>
          <button className="btn btn-block" disabled={!sabotageReady} onClick={game.triggerSabotage}>
            {sabotageReady ? `Sabotage (${game.sabotageUsesRemaining})` : 'Sabotage unavailable'}
          </button>
        </div>
      )}

      {canSheriffShoot && (
        <button className="btn btn-danger btn-block" onClick={() => setShooting(true)}>
          Shoot a suspect
        </button>
      )}

      {canEngineerVent && (
        <button className="btn btn-block" onClick={game.engineerVent}>
          Trigger decoy vent
        </button>
      )}

      {photoProofEnabled && (
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoSelected}
        />
      )}

      {photoError && (
        <p className="error-text" style={{ margin: 0 }}>
          {photoError}
        </p>
      )}

      {commonTask && (
        <div className="card stack-sm" style={{ borderColor: 'var(--warn)' }}>
          <span className="task-room">Everyone's task</span>
          <button
            className={`task-item ${commonTask.done ? 'done' : ''}`}
            disabled={commonTask.done || uploadingTaskId === commonTask.taskId}
            onClick={() => handleTaskClick(commonTask.taskId, commonTask.done)}
            style={{ textAlign: 'left', width: '100%', cursor: commonTask.done ? 'default' : 'pointer' }}
          >
            <span className={`task-check ${commonTask.done ? 'checked' : ''}`}>{commonTask.done ? '✓' : ''}</span>
            <span style={{ flex: 1 }}>
              {uploadingTaskId === commonTask.taskId ? 'Uploading photo…' : commonTask.text}
            </span>
            {commonTask.visual && <span className="badge">Visual</span>}
            {photoProofEnabled && !commonTask.done && <span className="badge">📷 Photo</span>}
          </button>
        </div>
      )}

      <div className="stack">
        {grouped.map(([roomType, tasks]) => (
          <div key={roomType} className="stack" style={{ gap: 8 }}>
            <span className="task-room">{ROOM_LABELS[roomType]}</span>
            {tasks.map((t) => (
              <button
                key={t.taskId}
                className={`task-item ${t.done ? 'done' : ''}`}
                disabled={t.done || uploadingTaskId === t.taskId}
                onClick={() => handleTaskClick(t.taskId, t.done)}
                style={{ textAlign: 'left', width: '100%', cursor: t.done ? 'default' : 'pointer' }}
              >
                <span className={`task-check ${t.done ? 'checked' : ''}`}>{t.done ? '✓' : ''}</span>
                <span style={{ flex: 1 }}>{uploadingTaskId === t.taskId ? 'Uploading photo…' : t.text}</span>
                {t.visual && <span className="badge">Visual</span>}
                {photoProofEnabled && !t.done && <span className="badge">📷 Photo</span>}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="spacer" />

      {!game.dead && (
        <div className="stack" style={{ gap: 6 }}>
          {game.isHost ? (
            editingSpot ? (
              <div className="row">
                <input
                  className="field"
                  value={spotDraft}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setSpotDraft(e.target.value)}
                />
                <button
                  className="btn btn-sm btn-primary"
                  disabled={!spotDraft.trim()}
                  onClick={() => {
                    game.updateSettings({ meetingSpot: spotDraft });
                    setEditingSpot(false);
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ alignSelf: 'center' }}
                onClick={() => {
                  setSpotDraft(room.settings.meetingSpot);
                  setEditingSpot(true);
                }}
              >
                Meeting spot: <strong style={{ color: 'var(--text)' }}>{room.settings.meetingSpot}</strong> · edit
              </button>
            )
          ) : (
            room.settings.meetingSpot && (
              <p className="subtitle" style={{ textAlign: 'center', margin: 0 }}>
                Meeting spot: <strong style={{ color: 'var(--text)' }}>{room.settings.meetingSpot}</strong>
              </p>
            )
          )}
          <button className="btn btn-block" onClick={() => game.callMeeting('emergency')}>
            Call meeting
          </button>
        </div>
      )}

      {killing && (
        <div
          className="toast"
          style={{ top: 0, bottom: 'auto', position: 'fixed', maxHeight: '80dvh', overflowY: 'auto' }}
        >
          <h3>Who did you eliminate?</h3>
          <div className="stack">
            {killTargets.length === 0 && <p className="subtitle">No one nearby to eliminate.</p>}
            {killTargets.map((p) => (
              <button
                key={p.id}
                className="btn btn-danger btn-block"
                onClick={() => {
                  game.attemptKill(p.id, p.name);
                  setKilling(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" onClick={() => setKilling(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {protecting && (
        <div
          className="toast"
          style={{ top: 0, bottom: 'auto', position: 'fixed', maxHeight: '80dvh', overflowY: 'auto' }}
        >
          <h3>Shield who from the next kill?</h3>
          <p className="subtitle">You only get to do this once, so choose carefully.</p>
          <div className="stack">
            {protectTargets.map((p) => (
              <button
                key={p.id}
                className="btn btn-primary btn-block"
                onClick={() => {
                  game.guardianProtect(p.id);
                  setProtecting(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" onClick={() => setProtecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {shooting && (
        <div
          className="toast"
          style={{ top: 0, bottom: 'auto', position: 'fixed', maxHeight: '80dvh', overflowY: 'auto' }}
        >
          <h3>Shoot who?</h3>
          <p className="subtitle">One shot only. Guess wrong and you're eliminated instead.</p>
          <div className="stack">
            {shootTargets.map((p) => (
              <button
                key={p.id}
                className="btn btn-danger btn-block"
                onClick={() => {
                  game.sheriffShoot(p.id);
                  setShooting(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <button className="btn btn-ghost btn-block" onClick={() => setShooting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(game.killAttempt.status === 'pending' || game.killAttempt.status === 'listening') && (
        <div className="toast" style={{ top: 0, bottom: 'auto', position: 'fixed' }}>
          <div className="stack center">
            <h3 style={{ margin: 0 }}>Verifying you're close to {game.killAttempt.targetName}…</h3>
            <p className="subtitle">
              {game.killAttempt.status === 'listening'
                ? 'Playing a quiet tone. Stay near them and keep this screen open.'
                : 'Starting…'}
            </p>
            <button className="btn btn-ghost btn-block" onClick={game.cancelKillAttempt}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {game.killAttempt.status === 'failed' && (
        <div className="toast" style={{ top: 0, bottom: 'auto', position: 'fixed' }}>
          <div className="stack center">
            <h3 style={{ margin: 0 }}>Couldn't verify {game.killAttempt.targetName}</h3>
            <p className="subtitle">{game.killAttempt.reason ?? 'Get closer and try again.'}</p>
            <button
              className="btn btn-danger btn-block"
              onClick={() => game.attemptKill(game.killAttempt.targetId!, game.killAttempt.targetName!)}
            >
              Try again
            </button>
            <button
              className="btn btn-outline btn-block"
              onClick={() => {
                game.killPlayer(game.killAttempt.targetId!);
                game.cancelKillAttempt();
              }}
            >
              Eliminate anyway (skip check)
            </button>
            <button className="btn btn-ghost btn-block" onClick={game.cancelKillAttempt}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
