import type { ReactNode } from 'react';
import { BookOpen, Crosshair, ListChecks, MapPin, Siren, Sparkles, Target, Trophy } from 'lucide-react';
import type { SpecialRole } from '@irl-impostor/shared';
import Sheet from './ui/Sheet';
import { ROLE_INFO } from './roles';

const SPECIAL_ROLES: SpecialRole[] = ['judge', 'guardian-angel', 'sheriff', 'engineer'];

function Section({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: 'red' | 'cyan' | 'green' | 'amber';
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guide-section">
      <div className={`icon-circle ${tone}`}>{icon}</div>
      <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
        <h3 className="h3">{title}</h3>
        {children}
      </div>
    </section>
  );
}

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Sheet
      title="How to play"
      description="Hidden roles, real rooms. Your phone is your controller and the house is the map."
      icon={
        <div className="icon-circle red">
          <BookOpen size={20} />
        </div>
      }
      onClose={onClose}
    >
      <div className="guide">
        <Section icon={<Target size={19} />} tone="green" title="The goal">
          <p>
            <strong>Crewmates</strong> win by finishing every task or voting out every impostor.
          </p>
          <p>
            <strong>Impostors</strong> win by eliminating crewmates until they're equal in number, or by running out
            the 20 minute clock.
          </p>
        </Section>

        <Section icon={<Sparkles size={19} />} tone="red" title="Getting started">
          <ol>
            <li>One person hosts and picks a meeting spot, a real place like the couch.</li>
            <li>Everyone else joins with the 4-letter code or the invite link.</li>
            <li>The host starts. Your role appears on your phone only. Keep it secret, and tap Hide if someone is peeking.</li>
          </ol>
        </Section>

        <Section icon={<ListChecks size={19} />} tone="cyan" title="Crewmates">
          <p>Walk to each task around the house, do it for real, then tap it (or snap a photo if photo proof is on).</p>
          <p>
            Tasks marked <strong>Visual</strong> are easy for others to watch. If someone never seems to do theirs, be
            suspicious.
          </p>
        </Section>

        <Section icon={<Crosshair size={19} />} tone="red" title="Impostors">
          <p>Your task list is fake, so pretend to do it. Your tools:</p>
          <ul>
            <li>
              <strong>Eliminate:</strong> stand right next to someone, tap Eliminate and pick them. Their phone listens
              for a quiet tone from yours to prove you're close.
            </li>
            <li>
              <strong>Vent:</strong> blacks out every screen for a few seconds so you can slip away.
            </li>
            <li>
              <strong>Sabotage:</strong> shows everyone two scrambled words. The clock drains faster until someone
              solves both.
            </li>
          </ul>
          <p>Eliminate and Vent are ready right away, then each needs 45 seconds to recharge.</p>
        </Section>

        <Section icon={<Siren size={19} />} tone="amber" title="If you're eliminated">
          <p>
            Your phone buzzes to let you know. Don't react and don't say who did it. Keep doing your tasks as a ghost, they
            still count for the crew.
          </p>
        </Section>

        <Section icon={<MapPin size={19} />} tone="amber" title="Meetings">
          <p>
            Anyone alive can call one meeting per game. Everyone heads to the meeting spot, talks for a minute, then votes.
            The most votes is out. A tie or a skip means nobody goes.
          </p>
        </Section>

        <Section icon={<Trophy size={19} />} tone="green" title="Special roles">
          <p>The host can add these. Each is dealt to one crewmate.</p>
          <div className="stack-sm" style={{ marginTop: 6 }}>
            {SPECIAL_ROLES.map((role) => {
              const { label, Icon, className, summary } = ROLE_INFO[role];
              return (
                <div key={role} className="guide-role">
                  <span className={`role-chip ${className}`}>
                    <Icon size={14} strokeWidth={2.4} />
                    {label}
                  </span>
                  <p>{summary}</p>
                </div>
              );
            })}
          </div>
        </Section>

        <div className="card card-tight guide-tips">
          <span className="label">Tips</span>
          <ul>
            <li>Turn your volume up and allow the microphone when asked. Eliminations use sound.</li>
            <li>Your screen stays awake during a round, so leave the app open while you play.</li>
            <li>Lost signal? Just reopen the link. You'll drop straight back into your game.</li>
          </ul>
        </div>
      </div>

      <button className="btn btn-primary btn-lg btn-block" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  );
}
