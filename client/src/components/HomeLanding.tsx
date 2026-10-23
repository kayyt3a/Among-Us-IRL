import { ArrowRight, Camera, ChevronDown, House, Mic, Siren, Sparkles, Users } from 'lucide-react';
import type { SpecialRole } from '@irl-impostor/shared';
import { ROLE_INFO } from './roles';

const SHOWCASE = [
  { src: '/screens/role.jpg', title: 'A secret role', text: 'Only your phone knows if you are the imposter. Tap Hide if someone peeks.' },
  { src: '/screens/tasks.jpg', title: 'Real tasks', text: 'Tasks around the house, done for real. Optional photo proof keeps everyone honest.' },
  { src: '/screens/vote.jpg', title: 'Vote them out', text: 'Meet up, argue it out, vote. Everyone sees who voted for who.' },
];

const FAQ = [
  ['Is it free?', 'Yes. No ads, no accounts, nothing to pay for.'],
  [
    'Do we need to download an app?',
    "No. Everyone just opens irlimposter.com on their phone. You can add it to your home screen if you like, but you don't have to.",
  ],
  ['How many people can play?', 'Between 3 and 50. It is at its best with 6 to 15 and a few rooms to spread out in.'],
  ['Does it work on iPhone and Android?', 'Yes, in any up-to-date phone browser, like Safari or Chrome.'],
  [
    'Why does it want my microphone?',
    "To check the imposter is really standing next to you when they eliminate you: your phone listens for a quiet tone from theirs. Nothing is recorded or sent anywhere. If you say no, it still works on the honour system.",
  ],
  [
    'What happens to the task photos?',
    "Photos are only used if the host turns photo proof on. They're shown to your room in the end-of-game gallery, then deleted when the next round starts. They're never saved anywhere permanent.",
  ],
  ['What if my phone loses signal?', "Just reopen the link. You'll drop straight back into your game."],
  ['Do we need a big house?', 'Any space with a few rooms works: a house, a flat, a dorm floor, even a backyard.'],
] as const;

const ROLES: SpecialRole[] = ['judge', 'guardian-angel', 'sheriff', 'engineer'];

/** Everything below the fold on the home screen, for people who arrive from a link and want to know what this is. */
export default function HomeLanding({ onHost, onJoin }: { onHost: () => void; onJoin: () => void }) {
  return (
    <div className="landing">
      <a className="landing-more" href="#how-it-works">
        See how it works
        <ChevronDown size={18} />
      </a>

      <section id="how-it-works" className="landing-section">
        <span className="label">How it works</span>
        <h2 className="h1">A party game where the house is the map</h2>
        <ol className="landing-steps">
          <li>
            <div className="icon-circle red">
              <Sparkles size={19} />
            </div>
            <div>
              <b>One phone hosts</b>
              <span>Pick a meeting spot, like the couch, and share the room code.</span>
            </div>
          </li>
          <li>
            <div className="icon-circle cyan">
              <Users size={19} />
            </div>
            <div>
              <b>Everyone joins on their phone</b>
              <span>Roles are dealt in secret. Most of you are crew. One of you is the imposter.</span>
            </div>
          </li>
          <li>
            <div className="icon-circle green">
              <House size={19} />
            </div>
            <div>
              <b>Spread out and do tasks</b>
              <span>Real tasks in real rooms. The imposter fakes theirs and picks people off quietly.</span>
            </div>
          </li>
          <li>
            <div className="icon-circle amber">
              <Siren size={19} />
            </div>
            <div>
              <b>Find a body? Call a meeting</b>
              <span>Everyone runs to the meeting spot, argues it out and votes someone out.</span>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-section">
        <span className="label">Inside the game</span>
        <div className="showcase" aria-label="Screenshots">
          {SHOWCASE.map((s) => (
            <figure key={s.src} className="showcase-item">
              <div className="showcase-frame">
                <img src={s.src} alt={s.title} decoding="async" />
              </div>
              <figcaption>
                <b>{s.title}</b>
                <span>{s.text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <span className="label">Optional roles</span>
        <h2 className="h2">Spice it up</h2>
        <div className="landing-roles">
          {ROLES.map((role) => {
            const { label, Icon, className, summary } = ROLE_INFO[role];
            return (
              <div key={role} className="landing-role">
                <span className={`role-chip ${className}`}>
                  <Icon size={14} strokeWidth={2.4} />
                  {label}
                </span>
                <p>{summary}</p>
              </div>
            );
          })}
        </div>
        <div className="landing-extras">
          <span>
            <Mic size={15} /> Proximity-checked eliminations
          </span>
          <span>
            <Camera size={15} /> Photo proof for tasks
          </span>
        </div>
      </section>

      <section className="landing-section">
        <span className="label">Questions</span>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-section landing-cta">
        <h2 className="h1">Got a few friends and a few rooms?</h2>
        <button className="btn btn-primary btn-lg btn-block" onClick={onHost}>
          Host a game
          <ArrowRight size={18} />
        </button>
        <button className="btn btn-secondary btn-lg btn-block" onClick={onJoin}>
          Join a game
        </button>
      </section>

      <footer className="landing-footer">
        <p>No accounts. No tracking cookies. Task photos are deleted after every round.</p>
        <p>IRL Imposter</p>
      </footer>
    </div>
  );
}
