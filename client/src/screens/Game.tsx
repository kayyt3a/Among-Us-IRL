import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PlayerTask, RoomType, SpecialRole } from '@irl-impostor/shared';
import {
  AudioLines,
  Bath,
  BedDouble,
  Camera,
  Check,
  CircleMinus,
  CirclePlus,
  CookingPot,
  Crosshair,
  Eye,
  Ghost,
  ListChecks,
  LoaderCircle,
  MapPin,
  Moon,
  Pencil,
  ShieldCheck,
  Siren,
  Skull,
  Sofa,
  Star,
  Trees,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Countdown from '../components/Countdown';
import SabotagePuzzleCard from '../components/SabotagePuzzleCard';
import SpecialRoleBadge from '../components/SpecialRoleBadge';
import Avatar from '../components/ui/Avatar';
import Sheet from '../components/ui/Sheet';
import { ProgressBar } from '../components/ui/Controls';
import { downscaleImageToDataUrl } from '../utils/image';

const ROOMS: Record<RoomType, { label: string; Icon: LucideIcon }> = {
  kitchen: { label: 'Kitchen', Icon: CookingPot },
  bathroom: { label: 'Bathroom', Icon: Bath },
  'living-room': { label: 'Living room', Icon: Sofa },
  bedroom: { label: 'Bedroom', Icon: BedDouble },
  outdoor: { label: 'Outdoor', Icon: Trees },
  'any-room': { label: 'Anywhere', Icon: MapPin },
};

const SPECIAL_ROLE_HINTS: Record<SpecialRole, string> = {
  judge: 'During a vote you can overrule the result once.',
  'guardian-angel': 'Once you die, you can shield a living player from one kill.',
  sheriff: 'You can shoot one suspect. Guess wrong and you are eliminated instead.',
  engineer: 'You can trigger one decoy blackout, for misdirection.',
};

/**
 * The current time, refreshed at the next of these deadlines, so a cooldown
 * button enables the instant its countdown hits 0:00 rather than whenever
 * something unrelated happens to re-render the screen.
 */
function useClockAt(deadlines: number[]): number {
  const [now, setNow] = useState(() => Date.now());
  const next = Math.min(...deadlines.filter((t) => t > now));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const t = setTimeout(() => setNow(Date.now()), next - Date.now() + 30);
    return () => clearTimeout(t);
  }, [next]);
  return now;
}

function Ability({
  icon,
  label,
  status,
  ready,
  primary,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  status: ReactNode;
  ready: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`ability${primary ? ' primary' : ''}`} disabled={!ready} onClick={onClick}>
      <span className="ability-icon">{icon}</span>
      <span className="ability-label">{label}</span>
      <span className="ability-status">{status}</span>
    </button>
  );
}

function TaskRow({
  task,
  photoProof,
  uploading,
  onTap,
}: {
  task: PlayerTask;
  photoProof: boolean;
  uploading: boolean;
  onTap: () => void;
}) {
  return (
    <button className={`task${task.done ? ' done' : ''}`} disabled={task.done || uploading} onClick={onTap}>
      <span className={`task-check${task.done ? ' checked' : ''}`}>
        {task.done && <Check size={15} strokeWidth={3.5} />}
        {uploading && <LoaderCircle className="spin" size={15} />}
      </span>
      <span className="task-body">
        <span className="task-text">{uploading ? 'Uploading photo…' : task.text}</span>
        {task.visual && (
          <span className="task-meta" title="Someone watching could see you do this">
            <Eye size={12} strokeWidth={2.5} />
            Visual task
          </span>
        )}
      </span>
      {photoProof && !task.done && !uploading && (
        <span className="task-photo" aria-label="Needs a photo">
          <Camera size={17} />
        </span>
      )}
    </button>
  );
}

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

  const now = useClockAt([game.killAvailableAt, game.ventAvailableAt, game.sabotageAvailableAt]);

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
    const map = new Map<RoomType, PlayerTask[]>();
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
  const myId = game.session?.playerId;
  // Impostors see everyone's real status (server-personalized), so already-dead
  // players show up greyed out here instead of just disappearing.
  // Mid-round spectators aren't in this round, so nobody can target them.
  const inRound = room.players.filter((p) => !p.isSpectator);
  const killTargets = inRound.filter((p) => p.id !== myId);
  const protectTargets = inRound.filter((p) => p.status === 'alive');
  const shootTargets = inRound.filter((p) => p.id !== myId && p.status === 'alive');

  const attemptInFlight = game.killAttempt.status === 'pending' || game.killAttempt.status === 'listening';
  const killReady = now >= game.killAvailableAt && !attemptInFlight;
  const ventReady = now >= game.ventAvailableAt;
  const sabotageReady = game.sabotageUsesRemaining > 0 && now >= game.sabotageAvailableAt && !room.sabotagePuzzle;
  const canGuardianProtect = game.dead && game.mySpecialRole === 'guardian-angel' && !game.specialRoleUsed;
  const canSheriffShoot = !game.dead && game.mySpecialRole === 'sheriff' && !game.specialRoleUsed;
  const canEngineerVent = !game.dead && game.mySpecialRole === 'engineer' && !game.specialRoleUsed;
  const crew = room.crewTaskProgress;
  const crewPct = crew.total > 0 ? Math.round((crew.done / crew.total) * 100) : 0;

  let sabotageStatus: ReactNode;
  if (game.sabotageUsesRemaining <= 0) sabotageStatus = 'None left';
  else if (room.sabotagePuzzle) sabotageStatus = 'In progress';
  else if (sabotageReady) sabotageStatus = `Ready · ${game.sabotageUsesRemaining} left`;
  else sabotageStatus = <Countdown endsAt={game.sabotageAvailableAt} />;

  return (
    <>
      <div className={`screen${game.dead ? ' ghost-overlay' : ' has-footer'}`}>
        <header className="row">
          <span className="pill pill-lg tabular" aria-label={`Room ${room.code}`}>
            {room.code}
          </span>
          <div className="spacer" />
          <span className="pill pill-lg tabular" aria-label={`${doneCount} of ${game.myTasks.length} tasks done`}>
            <ListChecks size={14} />
            {doneCount}/{game.myTasks.length}
          </span>
        </header>

        <div className="card hud">
          {room.gameEndsAt && (
            <div className="stack-xs">
              <span className="label">Time left</span>
              <span className="hud-timer">
                <Countdown endsAt={room.gameEndsAt} urgentBelowMs={30_000} />
              </span>
            </div>
          )}
          <div className="stack-sm" style={{ gridColumn: room.gameEndsAt ? undefined : '1 / -1' }}>
            <div className="row">
              <span className="label">Crew tasks</span>
              <div className="spacer" />
              <span className="small muted tabular">{crewPct}%</span>
            </div>
            <ProgressBar value={crew.done} total={crew.total} label="Crew task progress" />
          </div>
        </div>

        {room.sabotagePuzzle && <SabotagePuzzleCard puzzle={room.sabotagePuzzle} />}

        {game.dead ? (
          <div className="card stack center" style={{ alignItems: 'center', padding: 22 }}>
            <div className="icon-circle lg">
              <Ghost size={30} />
            </div>
            <div className="stack-xs">
              <h2 className="h2">You're a ghost</h2>
              <p className="muted small">
                Stay quiet about what you saw. You can still finish your tasks, but you can't call meetings or vote.
              </p>
            </div>
            {canGuardianProtect && (
              <button className="btn btn-primary btn-block" onClick={() => setProtecting(true)}>
                <ShieldCheck size={18} />
                Protect a player
              </button>
            )}
          </div>
        ) : roleHidden ? (
          <button className="role-hidden" onClick={() => setRoleHidden(false)} aria-label="Show your role">
            <div className="list-row-main">
              <span className="list-row-title">Role hidden</span>
              <span className="list-row-sub">Tap to show it again</span>
            </div>
            <CirclePlus size={24} />
          </button>
        ) : (
          <div className={`role-card ${game.myRole ?? ''}`}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="stack-xs" style={{ flex: 1 }}>
                <span className="label">Your role</span>
                <span className="role-name">{isImpostor ? 'Impostor' : 'Crewmate'}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoleHidden(true)} aria-label="Hide role">
                <CircleMinus size={17} />
                Hide
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              {isImpostor
                ? 'Blend in, fake your tasks, and eliminate crewmates when no one is looking.'
                : 'Finish your tasks around the house and watch for anyone acting strange.'}
            </p>
            {isImpostor && game.fellowImpostors.length > 0 && (
              <div className="row-sm" style={{ marginTop: 14, flexWrap: 'wrap' }}>
                <span className="label" style={{ marginRight: 4 }}>
                  Your team
                </span>
                {game.fellowImpostors.map((f) => (
                  <span key={f.id} className="pill pill-red">
                    {f.name}
                  </span>
                ))}
              </div>
            )}
            {!isImpostor && game.mySpecialRole && (
              <div className="stack-sm" style={{ marginTop: 14, alignItems: 'flex-start' }}>
                <SpecialRoleBadge role={game.mySpecialRole} />
                <p className="small muted">{SPECIAL_ROLE_HINTS[game.mySpecialRole]}</p>
              </div>
            )}
          </div>
        )}

        {isImpostor && !game.dead && (
          <section className="stack-sm">
            <div className="section-header">
              <span className="label">Your tools</span>
            </div>
            <div className="grid-3">
              <Ability
                primary
                icon={<Crosshair size={18} />}
                label="Eliminate"
                ready={killReady}
                status={
                  attemptInFlight ? 'Verifying…' : killReady ? 'Ready' : <Countdown endsAt={game.killAvailableAt} />
                }
                onClick={() => setKilling(true)}
              />
              <Ability
                icon={<Moon size={18} />}
                label="Vent"
                ready={ventReady}
                status={ventReady ? 'Ready' : <Countdown endsAt={game.ventAvailableAt} />}
                onClick={game.triggerVent}
              />
              <Ability
                icon={<Zap size={18} />}
                label="Sabotage"
                ready={sabotageReady}
                status={sabotageStatus}
                onClick={game.triggerSabotage}
              />
            </div>
          </section>
        )}

        {(canSheriffShoot || canEngineerVent) && (
          <div className="stack-sm">
            {canSheriffShoot && (
              <button className="btn btn-secondary btn-block" style={{ borderColor: 'rgba(251,154,75,0.45)' }} onClick={() => setShooting(true)}>
                <Star size={18} color="var(--sheriff)" />
                Shoot a suspect
              </button>
            )}
            {canEngineerVent && (
              <button className="btn btn-secondary btn-block" style={{ borderColor: 'rgba(47,212,191,0.45)' }} onClick={game.engineerVent}>
                <Wrench size={18} color="var(--engineer)" />
                Trigger decoy vent
              </button>
            )}
          </div>
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

        <section className="stack">
          <div className="section-header">
            <span className="label">Your tasks</span>
            <div className="spacer" />
            <span className="faint tiny tabular">
              {doneCount} of {game.myTasks.length} done
            </span>
          </div>

          {photoProofEnabled && (
            <p className="small muted row-sm" style={{ padding: '0 4px' }}>
              <Camera size={14} className="text-cyan" />
              Photo proof is on. Tap a task to snap a photo of it done.
            </p>
          )}
          {photoError && (
            <p className="error-text" style={{ padding: '0 4px' }}>
              {photoError}
            </p>
          )}

          {commonTask && (
            <div className="card card-amber stack-sm" style={{ padding: 10 }}>
              <div className="row-sm text-amber" style={{ padding: '2px 4px' }}>
                <Users size={14} />
                <span className="label" style={{ color: 'inherit' }}>
                  Everyone's task
                </span>
              </div>
              <TaskRow
                task={commonTask}
                photoProof={photoProofEnabled}
                uploading={uploadingTaskId === commonTask.taskId}
                onTap={() => handleTaskClick(commonTask.taskId, commonTask.done)}
              />
            </div>
          )}

          {grouped.map(([roomType, tasks]) => {
            const { label, Icon } = ROOMS[roomType];
            return (
              <div key={roomType} className="stack-sm">
                <div className="task-group-header">
                  <Icon size={14} />
                  <span className="label">{label}</span>
                </div>
                {tasks.map((t) => (
                  <TaskRow
                    key={t.taskId}
                    task={t}
                    photoProof={photoProofEnabled}
                    uploading={uploadingTaskId === t.taskId}
                    onTap={() => handleTaskClick(t.taskId, t.done)}
                  />
                ))}
              </div>
            );
          })}
        </section>

        {!game.dead && (
          <div className="screen-footer">
            {room.settings.meetingSpot && (
              <div className="row-sm" style={{ justifyContent: 'center' }}>
                <MapPin size={14} className="faint" />
                <span className="small muted truncate">
                  Meeting spot: <strong style={{ color: 'var(--text)' }}>{room.settings.meetingSpot}</strong>
                </span>
                {game.isHost && (
                  <button
                    className="icon-btn plain"
                    style={{ width: 30, height: 30 }}
                    aria-label="Edit meeting spot"
                    onClick={() => {
                      setSpotDraft(room.settings.meetingSpot);
                      setEditingSpot(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <button className="btn btn-amber btn-lg btn-block" onClick={() => game.callMeeting('emergency')}>
              <Siren size={19} />
              Call meeting
            </button>
          </div>
        )}
      </div>

      {killing && (
        <Sheet
          title="Eliminate"
          description="Pick who you're standing next to. Their phone listens for a quiet tone from yours to confirm you're close."
          icon={
            <div className="icon-circle red">
              <Crosshair size={20} />
            </div>
          }
          onClose={() => setKilling(false)}
        >
          <div className="stack-sm">
            {killTargets.every((p) => p.status !== 'alive') && <p className="muted small">No one left to eliminate.</p>}
            {killTargets.map((p) =>
              p.status === 'alive' ? (
                <button
                  key={p.id}
                  className="choice danger"
                  onClick={() => {
                    game.attemptKill(p.id, p.name);
                    setKilling(false);
                  }}
                >
                  <Avatar name={p.name} />
                  {p.name}
                </button>
              ) : (
                <button key={p.id} className="choice" disabled>
                  <Avatar name={p.name} dead />
                  {p.name}
                  <span className="choice-trailing small">
                    <Skull size={15} />
                    Dead
                  </span>
                </button>
              )
            )}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setKilling(false)}>
            Cancel
          </button>
        </Sheet>
      )}

      {protecting && (
        <Sheet
          title="Shield a player"
          description="Blocks the next kill on them. You only get one shield, so choose carefully."
          icon={
            <div className="icon-circle" style={{ background: 'rgba(252,212,106,0.12)', color: 'var(--guardian)' }}>
              <ShieldCheck size={20} />
            </div>
          }
          onClose={() => setProtecting(false)}
        >
          <div className="stack-sm">
            {protectTargets.map((p) => (
              <button
                key={p.id}
                className="choice"
                onClick={() => {
                  game.guardianProtect(p.id);
                  setProtecting(false);
                }}
              >
                <Avatar name={p.name} />
                {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setProtecting(false)}>
            Cancel
          </button>
        </Sheet>
      )}

      {shooting && (
        <Sheet
          title="Take your shot"
          description="One shot only. If they're innocent, you're eliminated instead."
          icon={
            <div className="icon-circle" style={{ background: 'rgba(251,154,75,0.12)', color: 'var(--sheriff)' }}>
              <Star size={20} />
            </div>
          }
          onClose={() => setShooting(false)}
        >
          <div className="stack-sm">
            {shootTargets.map((p) => (
              <button
                key={p.id}
                className="choice danger"
                onClick={() => {
                  game.sheriffShoot(p.id);
                  setShooting(false);
                }}
              >
                <Avatar name={p.name} />
                {p.name}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setShooting(false)}>
            Cancel
          </button>
        </Sheet>
      )}

      {editingSpot && (
        <Sheet
          title="Meeting spot"
          description="Everyone sees the change right away."
          icon={
            <div className="icon-circle amber">
              <MapPin size={20} />
            </div>
          }
          onClose={() => setEditingSpot(false)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!spotDraft.trim()) return;
              game.updateSettings({ meetingSpot: spotDraft });
              setEditingSpot(false);
            }}
          >
            <input
              className="field"
              aria-label="Meeting spot"
              value={spotDraft}
              maxLength={40}
              autoFocus
              onChange={(e) => setSpotDraft(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={!spotDraft.trim()}>
              Save
            </button>
          </form>
        </Sheet>
      )}

      {attemptInFlight && (
        <Sheet
          title={`Checking you're next to ${game.killAttempt.targetName}`}
          description={
            game.killAttempt.status === 'listening'
              ? 'Playing a quiet tone. Stay right next to them and keep this screen open.'
              : 'Starting…'
          }
          icon={
            <div className="icon-circle red">
              <AudioLines size={20} className={game.killAttempt.status === 'listening' ? 'text-red' : undefined} />
            </div>
          }
        >
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <LoaderCircle className="spin faint" size={18} />
            <span className="muted small">
              {game.killAttempt.windowMs
                ? `Listening for up to ${Math.round(game.killAttempt.windowMs / 1000)} seconds`
                : 'Getting ready'}
            </span>
          </div>
          <button className="btn btn-ghost btn-block" onClick={game.cancelKillAttempt}>
            Cancel
          </button>
        </Sheet>
      )}

      {game.killAttempt.status === 'failed' && (
        <Sheet
          title={`Couldn't confirm ${game.killAttempt.targetName}`}
          description={game.killAttempt.reason ?? 'Get closer and try again.'}
          icon={
            <div className="icon-circle amber">
              <TriangleAlert size={20} />
            </div>
          }
          onClose={game.cancelKillAttempt}
        >
          <div className="stack-sm">
            <button
              className="btn btn-primary btn-block"
              onClick={() => game.attemptKill(game.killAttempt.targetId!, game.killAttempt.targetName!)}
            >
              Try again
            </button>
            <button
              className="btn btn-danger btn-block"
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
        </Sheet>
      )}
    </>
  );
}
