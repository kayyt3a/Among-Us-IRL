import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RoomSettings, SpecialRole } from '@irl-impostor/shared';
import {
  CircleHelp,
  Camera,
  Crosshair,
  Crown,
  DoorOpen,
  ListChecks,
  LogOut,
  MapPin,
  Plus,
  Trophy,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { useGame } from '../state/GameProvider';
import Avatar from '../components/ui/Avatar';
import RoomCode from '../components/ui/RoomCode';
import { Stepper, Toggle } from '../components/ui/Controls';
import { ROLE_INFO } from '../components/roles';
import HowToPlay from '../components/HowToPlay';

const MAX_CUSTOM_TASKS = 20;
const MEETING_SPOT_DEBOUNCE_MS = 400;
const MIN_PLAYERS = 3;

const ROLE_SETTINGS: { role: SpecialRole; key: keyof RoomSettings }[] = [
  { role: 'judge', key: 'judgeEnabled' },
  { role: 'guardian-angel', key: 'guardianAngelEnabled' },
  { role: 'sheriff', key: 'sheriffEnabled' },
  { role: 'engineer', key: 'engineerEnabled' },
];

function SettingRow({
  icon,
  iconColor,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div
        className="setting-icon"
        style={iconColor ? { color: iconColor, background: `color-mix(in srgb, ${iconColor} 14%, transparent)` } : undefined}
      >
        {icon}
      </div>
      <div className="list-row-main">
        <span className="list-row-title">{title}</span>
        {description && <span className="list-row-sub">{description}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Lobby() {
  const game = useGame();
  const room = game.room!;
  const settings = room.settings;
  const isHost = game.isHost;
  const playerCount = room.players.length;
  const maxImpostors = Math.max(1, Math.floor(playerCount / 3));
  const hostName = room.players.find((p) => p.isHost)?.name ?? 'the host';
  const [customDraft, setCustomDraft] = useState('');

  // Edited locally and only synced from the server while not focused.
  // Binding straight to settings.meetingSpot and emitting on every keystroke
  // made fast typing lose characters: the update for an earlier keystroke
  // would round-trip back and overwrite whatever had been typed since.
  const [spotDraft, setSpotDraft] = useState(settings.meetingSpot);
  const [showGuide, setShowGuide] = useState(false);
  const spotFocused = useRef(false);
  const spotDebounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!spotFocused.current) setSpotDraft(settings.meetingSpot);
  }, [settings.meetingSpot]);

  function handleSpotChange(value: string) {
    setSpotDraft(value);
    if (spotDebounce.current) clearTimeout(spotDebounce.current);
    spotDebounce.current = setTimeout(() => {
      game.updateSettings({ meetingSpot: value });
    }, MEETING_SPOT_DEBOUNCE_MS);
  }

  function addCustomTask() {
    const text = customDraft.trim();
    if (!text || settings.customTasks.length >= MAX_CUSTOM_TASKS) return;
    game.updateSettings({ customTasks: [...settings.customTasks, text] });
    setCustomDraft('');
  }

  function removeCustomTask(index: number) {
    game.updateSettings({ customTasks: settings.customTasks.filter((_, i) => i !== index) });
  }

  const enabledRoles = ROLE_SETTINGS.filter((r) => settings[r.key]);
  const startLabel =
    playerCount < MIN_PLAYERS
      ? `Waiting for ${MIN_PLAYERS - playerCount} more player${MIN_PLAYERS - playerCount > 1 ? 's' : ''}`
      : !settings.meetingSpot.trim()
        ? 'Set a meeting spot to start'
        : 'Start game';

  return (
    <div className="screen has-footer">
      <header className="row">
        <button className="icon-btn" aria-label="Leave room" onClick={game.leaveGame}>
          <LogOut size={18} />
        </button>
        <div className="spacer" />
        <span className="h3">Lobby</span>
        <div className="spacer" />
        <button className="icon-btn" aria-label="How to play" onClick={() => setShowGuide(true)}>
          <CircleHelp size={18} />
        </button>
        <span className="pill pill-lg" aria-label={`${playerCount} players`}>
          <Users size={14} />
          {playerCount}
        </span>
      </header>
      {showGuide && <HowToPlay onClose={() => setShowGuide(false)} />}

      <RoomCode code={room.code} />

      <section className="stack-sm">
        <div className="section-header">
          <span className="label">Players</span>
          <div className="spacer" />
          {playerCount < MIN_PLAYERS && (
            <span className="faint tiny">Need {MIN_PLAYERS - playerCount} more</span>
          )}
        </div>
        <div className="list">
          {room.players.map((p) => {
            const isMe = p.id === game.session?.playerId;
            return (
              <div className="list-row" key={p.id}>
                <Avatar name={p.name} />
                <div className="list-row-main">
                  <span className="list-row-title truncate">
                    {p.name}
                    {isMe && <span className="faint"> (you)</span>}
                  </span>
                  {(p.isHost || p.wins > 0) && (
                    <span className="list-row-sub row-sm">
                      {p.isHost && (
                        <span className="row-sm text-amber">
                          <Crown size={12} strokeWidth={2.5} />
                          Host
                        </span>
                      )}
                      {p.wins > 0 && (
                        <span className="row-sm">
                          <Trophy size={12} strokeWidth={2.5} />
                          {p.wins} win{p.wins > 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {isHost && !isMe && (
                  <div className="row-sm">
                    <button className="icon-btn" aria-label={`Make ${p.name} the host`} title="Make host" onClick={() => game.transferHost(p.id)}>
                      <Crown size={16} />
                    </button>
                    <button className="icon-btn danger" aria-label={`Remove ${p.name}`} title="Remove" onClick={() => game.kickPlayer(p.id)}>
                      <UserX size={16} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <div className="row" style={{ gap: 12 }}>
          <div className="icon-circle amber">
            <MapPin size={20} />
          </div>
          <div className="stack-xs">
            <h2 className="h3">Meeting spot</h2>
            <p className="muted small">A real place everyone runs to when a meeting is called.</p>
          </div>
        </div>
        {isHost ? (
          <input
            className="field"
            placeholder="e.g. Living room couch"
            aria-label="Meeting spot"
            value={spotDraft}
            maxLength={40}
            onFocus={() => {
              spotFocused.current = true;
            }}
            onBlur={() => {
              spotFocused.current = false;
              if (spotDebounce.current) clearTimeout(spotDebounce.current);
              game.updateSettings({ meetingSpot: spotDraft });
            }}
            onChange={(e) => handleSpotChange(e.target.value)}
          />
        ) : (
          <p className={settings.meetingSpot ? 'h2' : 'muted'}>
            {settings.meetingSpot || `Waiting for ${hostName} to pick one`}
          </p>
        )}
      </section>

      <section className="stack-sm">
        <div className="section-header">
          <span className="label">Game setup</span>
        </div>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <SettingRow icon={<ListChecks size={17} />} title="Tasks per player">
            {isHost ? (
              <Stepper
                label="Tasks"
                value={settings.tasksPerPlayer}
                min={3}
                max={8}
                onChange={(v) => game.updateSettings({ tasksPerPlayer: v })}
              />
            ) : (
              <span className="h3 tabular">{settings.tasksPerPlayer}</span>
            )}
          </SettingRow>
          <SettingRow
            icon={<Crosshair size={17} />}
            iconColor="var(--red)"
            title="Impostors"
            description={isHost ? `Up to ${maxImpostors} with ${playerCount} players` : undefined}
          >
            {isHost ? (
              <Stepper
                label="Impostors"
                value={settings.impostorCount}
                min={1}
                max={maxImpostors}
                onChange={(v) => game.updateSettings({ impostorCount: v })}
              />
            ) : (
              <span className="h3 tabular">{settings.impostorCount}</span>
            )}
          </SettingRow>
        </div>
      </section>

      {(isHost || enabledRoles.length > 0) && (
        <section className="stack-sm">
          <div className="section-header">
            <span className="label">Special roles</span>
            <div className="spacer" />
            <span className="faint tiny">Dealt to crewmates</span>
          </div>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {(isHost ? ROLE_SETTINGS : enabledRoles).map(({ role, key }) => {
              const { label, Icon, color, summary } = ROLE_INFO[role];
              return (
                <SettingRow key={role} icon={<Icon size={17} />} iconColor={color} title={label} description={summary}>
                  {isHost && (
                    <Toggle
                      label={label}
                      checked={settings[key] as boolean}
                      onChange={(v) => game.updateSettings({ [key]: v })}
                    />
                  )}
                </SettingRow>
              );
            })}
          </div>
        </section>
      )}

      <section className="stack-sm">
        <div className="section-header">
          <span className="label">House rules</span>
        </div>
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <SettingRow
            icon={<DoorOpen size={17} />}
            title="Latecomers play immediately"
            description={settings.lateJoinersPlayNow ? 'Anyone joining mid-round is dealt straight in.' : 'Anyone joining mid-round watches until the next one.'}
          >
            {isHost ? (
              <Toggle
                label="Latecomers play immediately"
                checked={settings.lateJoinersPlayNow}
                onChange={(v) => game.updateSettings({ lateJoinersPlayNow: v })}
              />
            ) : (
              <span className={`pill ${settings.lateJoinersPlayNow ? 'pill-green' : ''}`}>
                {settings.lateJoinersPlayNow ? 'On' : 'Off'}
              </span>
            )}
          </SettingRow>
          <SettingRow
            icon={<Camera size={17} />}
            title="Photo proof for every task"
            description="Tasks need a photo instead of a tap, so the losing side can check nobody cheated."
          >
            {isHost ? (
              <Toggle
                label="Photo proof for every task"
                checked={settings.photoProofEnabled}
                onChange={(v) => game.updateSettings({ photoProofEnabled: v })}
              />
            ) : (
              <span className={`pill ${settings.photoProofEnabled ? 'pill-green' : ''}`}>
                {settings.photoProofEnabled ? 'On' : 'Off'}
              </span>
            )}
          </SettingRow>
        </div>
      </section>

      {(isHost || settings.customTasks.length > 0) && (
        <section className="stack-sm">
          <div className="section-header">
            <span className="label">Custom tasks</span>
            <div className="spacer" />
            <span className="faint tiny tabular">
              {settings.customTasks.length}/{MAX_CUSTOM_TASKS}
            </span>
          </div>
          <div className="card stack">
            {isHost && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCustomTask();
                }}
              >
                <input
                  className="field"
                  placeholder="e.g. Do your best chicken impression"
                  aria-label="New custom task"
                  value={customDraft}
                  maxLength={80}
                  onChange={(e) => setCustomDraft(e.target.value)}
                />
                <button
                  type="submit"
                  className="icon-btn"
                  style={{ width: 52, height: 52, borderRadius: 14 }}
                  aria-label="Add task"
                  disabled={!customDraft.trim() || settings.customTasks.length >= MAX_CUSTOM_TASKS}
                >
                  <Plus size={20} />
                </button>
              </form>
            )}
            {settings.customTasks.length === 0 ? (
              <p className="muted small">None yet. Everyone gets tasks from the built-in pool, 150 of them.</p>
            ) : (
              <div className="list">
                {settings.customTasks.map((t, i) => (
                  <div className="list-row" key={i} style={{ minHeight: 48 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{t}</span>
                    {isHost && (
                      <button className="icon-btn plain" aria-label={`Remove "${t}"`} onClick={() => removeCustomTask(i)}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="screen-footer">
        {isHost ? (
          <button
            className="btn btn-primary btn-lg btn-block"
            disabled={playerCount < MIN_PLAYERS || !settings.meetingSpot.trim()}
            onClick={game.startGame}
          >
            {startLabel}
          </button>
        ) : (
          <div className="card card-tight row" style={{ justifyContent: 'center', gap: 10 }}>
            <span className="pill pill-amber">
              <span className="live-dot" />
              Waiting
            </span>
            <span className="muted small">for {hostName} to start the game</span>
          </div>
        )}
      </div>
    </div>
  );
}
